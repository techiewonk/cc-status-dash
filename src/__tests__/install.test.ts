import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSettings, installStatusline, settingsPath, describeExistingStatusline, HOOK_TAG } from "../config/install.js";

const OPTS = { command: 'node "/x/dist/index.js"', refreshInterval: 10, padding: 0 };

test("buildSettings adds a statusLine and preserves unmanaged keys", () => {
  const out = buildSettings({ theme: "dark", model: "opus" }, OPTS);
  assert.equal(out.theme, "dark");
  assert.equal(out.model, "opus");
  assert.deepEqual(out.statusLine, { type: "command", command: OPTS.command, padding: 0, refreshInterval: 10 });
  assert.equal("hooks" in out, false); // no hooks requested, none created
});

test("buildSettings registers tagged skills hooks when asked", () => {
  const out = buildSettings({}, { ...OPTS, installHooks: true });
  const hooks = out.hooks as Record<string, { matcher?: string; _source?: string; hooks: { command: string }[] }[]>;
  assert.equal(hooks.PreToolUse[0].matcher, "Skill");
  assert.equal(hooks.PreToolUse[0]._source, HOOK_TAG);
  assert.match(hooks.PreToolUse[0].hooks[0].command, /--hook$/);
  assert.equal(hooks.UserPromptSubmit[0]._source, HOOK_TAG);
  assert.match(hooks.UserPromptSubmit[0].hooks[0].command, /--hook$/);
});

test("re-install is idempotent and preserves the user's own hooks", () => {
  const userHook = { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] };
  const first = buildSettings({ hooks: { PreToolUse: [userHook] } }, { ...OPTS, installHooks: true });
  // running it again over its own output must not duplicate the managed block
  const second = buildSettings(first, { ...OPTS, installHooks: true });
  const pre = (second.hooks as Record<string, unknown[]>).PreToolUse;
  assert.equal(pre.length, 2, "user hook + exactly one managed hook");
  assert.deepEqual(pre[0], userHook); // user's hook preserved and untouched
  assert.equal((pre[1] as { _source?: string })._source, HOOK_TAG);
});

test("toggling hooks off strips the managed block but keeps user hooks", () => {
  const withHooks = buildSettings({ hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "mine" }] }] } }, { ...OPTS, installHooks: true });
  assert.equal((withHooks.hooks as Record<string, unknown[]>).UserPromptSubmit.length, 2);
  const off = buildSettings(withHooks, { ...OPTS, installHooks: false });
  const ups = (off.hooks as Record<string, { hooks: { command: string }[] }[]>).UserPromptSubmit;
  assert.equal(ups.length, 1, "only the user's own hook remains");
  assert.equal(ups[0].hooks[0].command, "mine");
});

test("refreshInterval is omitted when not provided", () => {
  const out = buildSettings({}, { command: "x" });
  assert.equal("refreshInterval" in (out.statusLine as object), false);
  assert.equal((out.statusLine as { padding: number }).padding, 0);
});

// ---- IO wrapper ----
function withSettingsDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-settings-"));
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  try { fn(dir); } finally {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("installStatusline writes settings.json, preserves existing keys, and backs up", () => {
  withSettingsDir((dir) => {
    const p = join(dir, "settings.json");
    writeFileSync(p, JSON.stringify({ theme: "light", permissions: { allow: ["Bash"] } }), "utf8");
    const res = installStatusline({ ...OPTS, installHooks: true });
    assert.equal(res.ok, true);
    assert.equal(res.path, settingsPath());
    assert.equal(res.backedUp, true);
    assert.ok(existsSync(`${p}.bak`), "a .bak backup was written");
    const written = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    assert.equal(written.theme, "light"); // untouched
    assert.deepEqual(written.permissions, { allow: ["Bash"] }); // untouched
    assert.ok(written.statusLine && written.hooks); // ours added
  });
});

test("installStatusline refuses to overwrite invalid JSON", () => {
  withSettingsDir((dir) => {
    const p = join(dir, "settings.json");
    writeFileSync(p, "{ not json ", "utf8");
    const res = installStatusline(OPTS);
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /not valid JSON/);
    assert.equal(readFileSync(p, "utf8"), "{ not json "); // left intact
  });
});

test("installStatusline creates settings.json when none exists", () => {
  withSettingsDir((dir) => {
    const res = installStatusline(OPTS);
    assert.equal(res.ok, true);
    assert.equal(res.backedUp, false); // nothing to back up
    assert.ok(existsSync(join(dir, "settings.json")));
  });
});

// ---- describeExistingStatusline: pre-write detection so /setup can ask consent
// before installStatusline() overwrites something the user didn't expect ----

test("describeExistingStatusline reports \"none\" when settings.json doesn't exist", () => {
  withSettingsDir(() => {
    assert.deepEqual(describeExistingStatusline(), { kind: "none" });
  });
});

test("describeExistingStatusline reports \"none\" for a settings.json with no statusLine", () => {
  withSettingsDir((dir) => {
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ theme: "dark" }), "utf8");
    assert.deepEqual(describeExistingStatusline(), { kind: "none" });
  });
});

test('describeExistingStatusline reports "own" for a cc-status-dash statusLine (safe reinstall)', () => {
  withSettingsDir((dir) => {
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ statusLine: { command: 'bun "/x/cc-status-dash/dist/index.js"' } }), "utf8");
    const out = describeExistingStatusline();
    assert.equal(out.kind, "own");
  });
});

test('describeExistingStatusline recognizes other known statusline tools', () => {
  withSettingsDir((dir) => {
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ statusLine: { command: "npx ccstatusline@latest" } }), "utf8");
    const out = describeExistingStatusline();
    assert.equal(out.kind, "known");
    assert.equal(out.knownAs, "ccstatusline");
  });
});

test("describeExistingStatusline reports \"custom\" for an unrecognized command", () => {
  withSettingsDir((dir) => {
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ statusLine: { command: "/home/me/my-statusline.sh" } }), "utf8");
    const out = describeExistingStatusline();
    assert.equal(out.kind, "custom");
    assert.equal(out.command, "/home/me/my-statusline.sh");
  });
});

test("describeExistingStatusline never throws on unreadable/corrupt settings.json", () => {
  withSettingsDir((dir) => {
    writeFileSync(join(dir, "settings.json"), "{ not json", "utf8");
    assert.deepEqual(describeExistingStatusline(), { kind: "none" });
  });
});
