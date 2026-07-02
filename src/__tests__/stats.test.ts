import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectStats } from "../data/stats.js";
import type { StatuslineInput } from "../types.js";

// Isolate the stats store per test via XDG_STATE_HOME so we never touch the real file.
function withStore(fn: () => void) {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-stats-"));
  const prev = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = dir;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("budget scope:block — blockCost reflects cost accrued in the current 5h window", () => {
  withStore(() => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600; // window resets in 1h => started 4h ago
    const input: StatuslineInput = {
      session_id: "s-block",
      cost: { total_cost_usd: 2.5 },
      rate_limits: { five_hour: { used_percentage: 50, resets_at: resetsAt } },
    };
    // First render: session began inside the current window, so block cost == session cost.
    const out = collectStats(input);
    assert.equal(out.sessionCost, 2.5);
    assert.ok(out.blockCost != null && out.blockCost >= 0, `blockCost should be defined, got ${out.blockCost}`);
    assert.ok(out.blockCost <= 2.5, "block cost can't exceed session cost");
  });
});

test("blockCost is undefined without a five-hour rate-limit window", () => {
  withStore(() => {
    const out = collectStats({ session_id: "s-nowin", cost: { total_cost_usd: 1 } });
    assert.equal(out.blockCost, undefined);
  });
});

// blockCacheHitRate: claude-code-statusline cache_efficiency.sh parity — a ratio
// over the whole 5h block (cacheRead / (input + cacheRead)) rather than cache-hit-
// rate's default per-turn scope. Reuses blockCost's exact baseline-anchoring logic.
test("blockCacheHitRate reflects cacheRead/(input+cacheRead) within the current block", () => {
  withStore(() => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600;
    const input: StatuslineInput = {
      session_id: "s-cache-block",
      cost: { total_cost_usd: 1 },
      context_window: { context_window_size: 200000, current_usage: { input_tokens: 20000, output_tokens: 1000, cache_read_input_tokens: 80000 } },
      rate_limits: { five_hour: { used_percentage: 50, resets_at: resetsAt } },
    };
    const out = collectStats(input);
    // Session began inside the window (baseline 0), so block totals == this turn's totals.
    assert.ok(out.blockCacheHitRate != null, "blockCacheHitRate should be defined");
    assert.equal(Math.round(out.blockCacheHitRate!), 80, `80k/(20k+80k) = 80%, got ${out.blockCacheHitRate}`);
  });
});

test("blockCacheHitRate is undefined without a five-hour rate-limit window", () => {
  withStore(() => {
    const out = collectStats({
      session_id: "s-cache-nowin",
      context_window: { context_window_size: 200000, current_usage: { input_tokens: 100, cache_read_input_tokens: 900 } },
    });
    assert.equal(out.blockCacheHitRate, undefined);
  });
});

test("blockCacheHitRate is undefined when there's no cache activity at all", () => {
  withStore(() => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600;
    const out = collectStats({ session_id: "s-nocache", rate_limits: { five_hour: { used_percentage: 10, resets_at: resetsAt } } });
    assert.equal(out.blockCacheHitRate, undefined);
  });
});

// repoCost: claude-code-statusline cost_repo.sh parity — cumulative cost across
// every session ever recorded in this project (matched by workspace cwd), not
// date-scoped like daily/weekly/monthly.
test("repoCost sums cost across every session sharing the same workspace cwd", () => {
  withStore(() => {
    collectStats({ session_id: "s-repo-a1", cost: { total_cost_usd: 1.5 }, workspace: { current_dir: "/home/dev/app" } });
    collectStats({ session_id: "s-repo-a2", cost: { total_cost_usd: 2.5 }, workspace: { current_dir: "/home/dev/app" } });
    collectStats({ session_id: "s-repo-b", cost: { total_cost_usd: 100 }, workspace: { current_dir: "/home/dev/other-project" } });

    const out = collectStats({ session_id: "s-repo-a1", cost: { total_cost_usd: 1.5 }, workspace: { current_dir: "/home/dev/app" } });
    assert.equal(out.repoCost, 4, `1.5 + 2.5 from the same repo, other-project excluded: ${out.repoCost}`);
  });
});

test("repoCost is undefined when the current session has no workspace cwd", () => {
  withStore(() => {
    const out = collectStats({ session_id: "s-norepo", cost: { total_cost_usd: 1 } });
    assert.equal(out.repoCost, undefined);
  });
});
