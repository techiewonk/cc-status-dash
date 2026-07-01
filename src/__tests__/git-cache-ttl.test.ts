import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { collectGit } from "../data/git.js";

// ccstatusline gitCacheTtlSeconds parity: the git provider's disk cache TTL is
// configurable. Rather than spy on git invocation counts, seed the cache file
// directly with a known-fake GitInfo (a value real git would never produce) and
// an old timestamp, then prove `cacheTtlSeconds` decides whether that fake entry
// is trusted (small TTL already expired → real git runs instead) or served as-is
// (large TTL → still "fresh" by the clock, so the fake value comes back verbatim).

function cacheFileFor(cwd: string, dir: string): string {
  // Mirrors src/data/git.ts's private gitCacheFile() path derivation exactly: when
  // XDG_CACHE_HOME is set, the file goes directly under it (no extra subdirectory
  // — that's only added in the tmpdir() fallback case).
  return join(dir, `git-${createHash("sha1").update(cwd).digest("hex").slice(0, 16)}.json`);
}

function withCache(fn: (cwd: string, cacheDir: string) => void) {
  const cacheDir = mkdtempSync(join(tmpdir(), "ccsd-gitcache-"));
  const prev = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheDir;
  try { fn(process.cwd(), cacheDir); } finally {
    if (prev === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = prev;
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

test("a large cacheTtlSeconds still trusts a several-second-old cache entry", () => {
  withCache((cwd, cacheDir) => {
    const file = cacheFileFor(cwd, cacheDir);
    const staleTs = Date.now() - 5000; // 5s old
    writeFileSync(file, JSON.stringify({ ts: staleTs, data: { isRepo: true, branch: "FAKE-CACHED" } }));

    const out = collectGit(cwd, { cacheTtlSeconds: 3600 }); // 1h TTL — 5s old is still fresh
    assert.equal(out.branch, "FAKE-CACHED", `expected the cached fake value to be trusted, got: ${JSON.stringify(out)}`);
  });
});

test("a tiny cacheTtlSeconds treats the same entry as stale and recomputes", () => {
  withCache((cwd, cacheDir) => {
    const file = cacheFileFor(cwd, cacheDir);
    const staleTs = Date.now() - 5000; // 5s old
    writeFileSync(file, JSON.stringify({ ts: staleTs, data: { isRepo: true, branch: "FAKE-CACHED" } }));

    const out = collectGit(cwd, { cacheTtlSeconds: 0 }); // 0s TTL — anything already written is stale
    assert.notEqual(out.branch, "FAKE-CACHED", `expected a real recompute, got the fake cached value: ${JSON.stringify(out)}`);
  });
});

test("unset cacheTtlSeconds keeps the default 2s TTL (no config = no behavior change)", () => {
  withCache((cwd, cacheDir) => {
    const file = cacheFileFor(cwd, cacheDir);
    const freshTs = Date.now() - 500; // 0.5s old — within the 2s default
    writeFileSync(file, JSON.stringify({ ts: freshTs, data: { isRepo: true, branch: "FAKE-CACHED" } }));

    const out = collectGit(cwd, {});
    assert.equal(out.branch, "FAKE-CACHED", `default TTL should still trust a half-second-old entry: ${JSON.stringify(out)}`);
  });
});
