import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProviderData, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { getWidget, listWidgets } from "../widgets/index.js";
import { WIDGET_OPTION_SPECS } from "../tui/optionSpec.js";

// Data-driven coverage: render every implemented widget against rich synthetic
// stdin + provider data and assert the visible text. Runs on node:test & bun test.

const now = Date.now();
const INPUT: StatuslineInput = {
  model: { id: "claude-opus-4-8", display_name: "Claude Opus 4.8" },
  version: "2.1.97",
  session_id: "abcd1234efgh",
  output_style: { name: "concise" },
  workspace: { current_dir: "/home/dev/projects/deep/app" },
  context_window: {
    context_window_size: 200000, used_percentage: 54,
    current_usage: { input_tokens: 88000, output_tokens: 4000, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500 },
  },
  cost: { total_cost_usd: 3.42, total_duration_ms: 7200000, total_api_duration_ms: 1800000, total_lines_added: 120, total_lines_removed: 40 },
  rate_limits: {
    five_hour: { used_percentage: 38, resets_at: now + 3 * 3600 * 1000 },
    seven_day: { used_percentage: 61, resets_at: now + 3 * 86400 * 1000 },
  },
  effort: { level: "high" },
};

const DATA: ProviderData = {
  git: {
    isRepo: true, branch: "main", dirty: true, clean: false, ahead: 2, behind: 1,
    staged: 1, unstaged: 2, untracked: 3, conflicts: 1, insertions: 24, deletions: 7,
    sha: "abc1234", rootDir: "/home/dev/projects/deep/app", originOwner: "techiewonk",
    originRepo: "cc-status-dash", upstreamOwner: "up", upstreamRepo: "repo", isFork: true,
    stash: 2, tag: "v1.0.0", secondsSinceCommit: 7200, submodules: 1, commitCount: 42,
    operation: "MERGE", worktree: { mode: true, name: "app", branch: "main" },
  },
  transcript: {
    recentTools: [{ name: "Edit", target: "auth.ts", done: true }, { name: "Read", done: true }],
    toolCounts: [{ name: "Bash", count: 12, running: true }, { name: "Edit", count: 5, running: false }, { name: "Read", count: 2, running: false }],
    agents: [{ name: "explore", model: "haiku" }], todos: { total: 5, completed: 2, current: "Fix bug" },
    skills: ["pdf", "xlsx"], mcpServers: ["slack", "github"], sessionName: "my-session",
    sessionTokens: { input: 88000, output: 4000, cacheCreation: 500, cacheRead: 1000 },
    compactionCount: 3, msSinceLastUser: 200000, lastResponseMs: 4500,
  },
  system: {
    memTotalBytes: 16e9, memUsedBytes: 8e9, memUsedPct: 50, tmuxSession: "main", terminalWidth: 120,
    accountEmail: "a@b.com", claudeMdCount: 2, mcpConfigCount: 3, hooksCount: 1, rulesCount: 4,
  },
  stats: { sessionCost: 3.42, dailyCost: 5, weeklyCost: 10, monthlyCost: 20, tokenSpeed: { input: 10, output: 20, total: 30 }, messageCount: 7 },
};

function renderWidget(id: string, opts: Record<string, unknown> = {}): string {
  const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) };
  const ctx: RenderContext = { input: INPUT, data: DATA, config };
  const w = getWidget(id);
  assert.ok(w, `widget not registered: ${id}`);
  return w!.render(w!.collect(ctx), opts, ctx).map((s) => s.text).join("");
}

process.env.CCSD_TEST_VAR = "hello";

// [id, opts, expected substring]
const CASES: [string, Record<string, unknown>, string][] = [
  ["model", {}, "Opus 4.8"],
  ["provider", { showApi: true }, "API"],
  ["version", {}, "v2.1.97"],
  ["session-name", {}, "my-session"],
  ["claude-session-id", {}, "abcd1234"],
  ["thinking-effort", {}, "high"],
  ["compaction-counter", {}, "3"],
  ["context.bar", { mode: "remaining", barStyle: "blocks" }, "%"],
  ["context-percentage", {}, "54%"],
  ["context-percentage-usable", {}, "%"],
  ["context-length", {}, "k"],
  ["context-window", {}, "200"],
  ["tokens-input", {}, "88"],
  ["tokens-output", {}, "4"],
  ["tokens-cached", {}, "1"],
  ["tokens-total", {}, "k"],
  ["cache-read", {}, "1"],
  ["cache-write", {}, "5"],
  ["cache-hit-rate", {}, "%"],
  ["token-breakdown", { threshold: 0 }, "in "],
  ["tokens-per-min", {}, "tok/min"],
  ["cost", {}, "$3.42"],
  ["session-cost", {}, "$3.42"],
  ["usage.block", { showPace: true }, "%"],
  ["usage.weekly", { threshold: 0 }, "61%"],
  ["session-usage", {}, "%"],
  ["weekly-usage", { threshold: 0 }, "61%"],
  ["block-timer", {}, "h"],
  ["reset-timer", {}, "h"],
  ["weekly-reset-timer", {}, "d"],
  ["burn-rate", {}, "/hr"],
  ["burn-rate", { mode: "active" }, "/hr"],
  ["daily-cost", {}, "$5"],
  ["weekly-cost", {}, "$10"],
  ["monthly-cost", {}, "$20"],
  ["budget", { amount: 5, scope: "session" }, "%"],
  ["cost-projection", {}, "$"],
  ["git.branch", { showDirty: true, showAheadBehind: true, showDiff: true }, "main"],
  ["git-status", {}, "1"],
  ["git-changes", {}, "+24"],
  ["git-insertions", {}, "+24"],
  ["git-deletions", {}, "-7"],
  ["git-staged", {}, "1"],
  ["git-unstaged", {}, "2"],
  ["git-untracked", {}, "3"],
  ["git-conflicts", {}, "1"],
  ["git-sha", {}, "abc1234"],
  ["git-tag", {}, "v1.0.0"],
  ["git-stash", {}, "2"],
  ["git-ahead-behind", {}, "2"],
  ["git-root-dir", {}, "app"],
  ["git-origin-owner-repo", {}, "techiewonk/cc-status-dash"],
  ["git-is-fork", {}, "fork"],
  ["git-operation", {}, "MERGE"],
  ["git-submodules", {}, "1"],
  ["git-commit-count", {}, "42"],
  ["git-time-since-commit", {}, "h"],
  ["worktree-name", {}, "app"],
  ["cwd", { style: "fish" }, "app"],
  ["cwd", { style: "basename" }, "app"],
  ["free-memory", {}, "G"],
  ["terminal-width", {}, "120"],
  ["env", { variable: "CCSD_TEST_VAR" }, "hello"],
  ["session-clock", {}, ":"],
  ["activity.tools", {}, "Edit"],
  ["activity.tool-counts", {}, "Bash"],
  ["activity.tool-counts", {}, "×12"],
  ["activity.agents", {}, "explore"],
  ["activity.todos", {}, "2/5"],
  ["skills", { mode: "count" }, "2"],
  ["mcp-count", {}, "2"],
  ["session-duration", {}, "h"],
  ["total-api-time", {}, "m"],
  ["lines-added", {}, "+120"],
  ["lines-removed", {}, "-40"],
  ["cache-timer", {}, "m"],
  ["message-count", {}, "7"],
  ["last-response-time", {}, "4"],
  ["claude-account-email", {}, "a@b.com"],
  ["config-counts", {}, "2"],
];

for (const [id, opts, sub] of CASES) {
  test(`widget ${id}${opts && Object.keys(opts).length ? " " + JSON.stringify(opts) : ""} renders "${sub}"`, () => {
    const out = renderWidget(id, opts);
    assert.ok(out.length > 0, `${id} rendered empty`);
    assert.ok(out.includes(sub), `${id} expected to contain "${sub}", got "${out}"`);
  });
}

test("registry has the full widget set", () => {
  const ids = new Set(listWidgets().map((w) => w.id));
  for (const must of ["model", "context.bar", "usage.block", "git.branch", "activity.tools", "cost", "skills", "budget", "burn-rate"]) {
    assert.ok(ids.has(must), `missing widget ${must}`);
  }
  assert.ok(ids.size >= 80, `expected >=80 widgets, got ${ids.size}`);
});

test("widget count snapshot (bump deliberately when adding widgets)", () => {
  assert.equal(listWidgets().length, 114, "widget count changed — update docs (README/OPTIONS/COMPARISON) + this snapshot");
});

test("Phase 1 HUD widgets render from real data", () => {
  const ctx = (input: StatuslineInput, data: ProviderData = {}): RenderContext => ({ input, data, config: { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) } });
  // added-dirs from workspace.added_dirs
  const ad = getWidget("added-dirs")!;
  const adOut = ad.render(ad.collect(ctx({ workspace: { current_dir: "/x", added_dirs: ["/repo/shared", "/repo/lib"] } })), {}, ctx({ workspace: { added_dirs: ["/repo/shared", "/repo/lib"] } })).map((s) => s.text).join("");
  assert.match(adOut, /\+shared/, `added-dirs shows basenames, got ${adOut}`);
  // session-tokens + activity.mcp from transcript data
  const data: ProviderData = { transcript: { recentTools: [], toolCounts: [], agents: [], todos: { total: 0, completed: 0 }, skills: [], mcpServers: ["slack", "github"], sessionTokens: { input: 88000, output: 4000, cacheCreation: 0, cacheRead: 0 } } };
  const stOut = getWidget("session-tokens")!.render(null, {}, ctx({}, data)).map((s) => s.text).join("");
  assert.match(stOut, /88(\.0)?k/, `session-tokens shows input, got ${stOut}`);
  const mcpOut = getWidget("activity.mcp")!.render(null, {}, ctx({}, data)).map((s) => s.text).join("");
  assert.match(mcpOut, /slack/, `activity.mcp shows names, got ${mcpOut}`);
});

test("activity parity: agent description, tool-counts overflow + mcp shortening, separator", () => {
  const ctx = (data: ProviderData): RenderContext => ({ input: {}, data, config: { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) } });
  // agent description + model render (Claude HUD agents-line parity)
  const agData: ProviderData = { transcript: { recentTools: [], toolCounts: [], agents: [{ name: "Explore", model: "haiku", description: "find the auth flow", status: "running", elapsedSec: 12 }], todos: { total: 0, completed: 0 }, skills: [], mcpServers: [] } };
  const agOut = getWidget("activity.agents")!.render(null, {}, ctx(agData)).map((s) => s.text).join("");
  assert.match(agOut, /Explore \[haiku\]: find the auth flow \(12s\)/, `agents shows model+desc+elapsed, got ${agOut}`);
  // tool-counts: MCP id collapses to leaf, and overflow shows "+N more"
  const tcData: ProviderData = { transcript: { recentTools: [], toolCounts: [
    { name: "Bash", count: 12, running: false }, { name: "mcp__github__search_issues", count: 3, running: false },
    { name: "Edit", count: 2, running: false }, { name: "Read", count: 9, running: false },
    { name: "Grep", count: 4, running: false }, { name: "Write", count: 1, running: false },
  ], agents: [], todos: { total: 0, completed: 0 }, skills: [], mcpServers: [] } };
  const tcOut = getWidget("activity.tool-counts")!.render(null, { max: 5 }, ctx(tcData)).map((s) => s.text).join("");
  assert.match(tcOut, /search_issues/, `mcp tool id collapses to leaf, got ${tcOut}`);
  assert.doesNotMatch(tcOut, /mcp__github__/, `full mcp id should not appear, got ${tcOut}`);
  assert.match(tcOut, /\+1 more/, `overflow indicator when >max, got ${tcOut}`);
  // separator always renders a rule
  const sepOut = getWidget("activity.separator")!.render(null, { length: 6 }, ctx({})).map((s) => s.text).join("");
  assert.equal(sepOut, "──────", `separator emits a rule, got ${sepOut}`);
});

test("cc-state widgets: vim-mode, voice-status, remote-control-status", () => {
  const ctx = (input: StatuslineInput, data: ProviderData = {}): RenderContext => ({ input, data, config: { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) } });
  // vim-mode from stdin
  const vm = getWidget("vim-mode")!;
  assert.equal(vm.render(null, {}, ctx({ vim: { mode: "normal" } })).map((s) => s.text).join(""), "NORMAL");
  assert.deepEqual(vm.render(null, {}, ctx({})), [], "vim-mode culls when no mode");
  // voice-status from system
  const vs = getWidget("voice-status")!;
  assert.match(vs.render(null, { format: "text" }, ctx({}, { system: { voiceEnabled: true } })).map((s) => s.text).join(""), /on/);
  assert.deepEqual(vs.render(null, {}, ctx({}, { system: {} })), [], "voice culls when undefined");
  // remote-control from system
  const rc = getWidget("remote-control-status")!;
  assert.match(rc.render(null, {}, ctx({}, { system: { remoteControlEnabled: true } })).map((s) => s.text).join(""), /◉/);
  assert.deepEqual(rc.render(null, {}, ctx({}, { system: {} })), [], "remote culls when undefined");
  // thinking-effort fallback to configured default
  const te = getWidget("thinking-effort")!;
  assert.match(te.render(null, { default: "high" }, ctx({})).map((s) => s.text).join(""), /high/, "effort falls back to default");
  assert.match(te.render(null, { showUnknown: true }, ctx({})).map((s) => s.text).join(""), /\?/, "effort shows ? when showUnknown");
});

test("cwd link wraps the path in an OSC-8 file:// hyperlink", () => {
  const cfg = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) };
  const w = getWidget("cwd")!;
  const ctx: RenderContext = { input: { workspace: { current_dir: "D:/proj/app" } }, data: {}, config: cfg };
  const linked = w.render(null, { link: true, style: "basename" }, ctx).map((s) => s.text).join("");
  assert.match(linked, /\x1b\]8;;file:\/\/\/D:\/proj\/app\x07app\x1b\]8;;\x07/, `expected OSC-8 file link, got ${JSON.stringify(linked)}`);
  // no link option → plain text, no escape
  const plain = w.render(null, { style: "basename" }, ctx).map((s) => s.text).join("");
  assert.equal(plain, "app");
});

test("git.files renders per-file +/- with overflow", () => {
  const ctx = (data: ProviderData): RenderContext => ({ input: {}, data, config: { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) } });
  const data: ProviderData = { git: { isRepo: true, files: [
    { path: "src/widgets/index.ts", added: 4, removed: 1 },
    { path: "src/data/git.ts", added: 12, removed: 0 },
    { path: "README.md", added: 1, removed: 1 },
    { path: "docs/OPTIONS.md", added: 2, removed: 0 },
  ] } };
  const out = getWidget("git.files")!.render(null, { max: 3 }, ctx(data)).map((s) => s.text).join("");
  assert.match(out, /index\.ts \+4 -1/, `shows basename + counts, got ${out}`);
  assert.doesNotMatch(out, /src\/widgets/, `shows basename only, got ${out}`);
  assert.match(out, /\+1 more/, `overflow when >max, got ${out}`);
  assert.deepEqual(getWidget("git.files")!.render(null, {}, ctx({ git: { isRepo: true } })), [], "empty when no per-file data");
});

test("thinking-effort symbols + context value modes", () => {
  const cfg = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) };
  const eff = getWidget("thinking-effort")!;
  const ectx: RenderContext = { input: { effort: { level: "high" } }, data: {}, config: cfg };
  assert.match(eff.render(null, { symbols: true }, ectx).map((s) => s.text).join(""), /●/, "high effort → ● glyph");
  assert.match(eff.render(null, {}, ectx).map((s) => s.text).join(""), /high/, "default shows the word");
  const cp = getWidget("context-percentage")!;
  const cctx: RenderContext = { input: { context_window: { used_percentage: 46, context_window_size: 200000, current_usage: { input_tokens: 92000 } } }, data: {}, config: cfg };
  assert.match(cp.render(null, { value: "both" }, cctx).map((s) => s.text).join(""), /46% \(92\.0k\/200\.0k\)/, "value:both shows % + tokens");
  assert.match(cp.render(null, { value: "tokens" }, cctx).map((s) => s.text).join(""), /92\.0k\/200\.0k/, "value:tokens shows tokens");
});

test("usage limit-reached at 100%", () => {
  const ctx: RenderContext = { input: { rate_limits: { five_hour: { used_percentage: 100, resets_at: Math.floor(Date.now() / 1000) + 3600 } } }, data: {}, config: { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) } };
  const out = getWidget("usage.block")!.render(null, {}, ctx).map((s) => s.text).join("");
  assert.match(out, /limit/, `expected limit-reached, got ${out}`);
});

test("session-health + cache-roi render from existing data", () => {
  const input: StatuslineInput = {
    context_window: { used_percentage: 46, context_window_size: 200000, current_usage: { cache_read_input_tokens: 120000 } },
    rate_limits: { five_hour: { used_percentage: 40, resets_at: Math.floor(Date.now() / 1000) + 5400 } },
  };
  const ctx: RenderContext = { input, data: {}, config: { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) } };
  const sh = getWidget("session-health")!;
  const shOut = sh.render(sh.collect(ctx), {}, ctx).map((s) => s.text).join("");
  assert.match(shOut, /54% ctx/, `health shows context left, got ${shOut}`);
  assert.match(shOut, /5h 40%/, `health shows 5h usage, got ${shOut}`);
  const roi = getWidget("cache-roi")!;
  const roiOut = roi.render(roi.collect(ctx), {}, ctx).map((s) => s.text).join("");
  assert.match(roiOut, /saved/, `roi shows savings, got ${roiOut}`);
  const roiDollar = roi.render(roi.collect(ctx), { savedPerMTok: 10 }, ctx).map((s) => s.text).join("");
  assert.match(roiDollar, /\$1\.20 saved/, `roi $ estimate (120k * $10/M), got ${roiDollar}`);
});

test("every WIDGET_OPTION_SPECS key is a real widget id", () => {
  const ids = new Set(listWidgets().map((w) => w.id));
  for (const id of Object.keys(WIDGET_OPTION_SPECS)) {
    assert.ok(ids.has(id), `optionSpec references unknown widget id "${id}"`);
  }
});

test("empty providers render nothing (auto-cull)", () => {
  const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme) };
  const ctx: RenderContext = { input: {}, data: {}, config };
  for (const id of ["git.branch", "activity.tools", "usage.block", "cost", "skills"]) {
    const w = getWidget(id)!;
    assert.deepEqual(w.render(w.collect(ctx), {}, ctx), [], `${id} should be empty with no data`);
  }
});
