import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters as strip } from "node:util";
import type { ColorDepth, Config, LineStyle, ProviderData, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG, MAX_LAYERS, PRESET_CATALOG } from "../config/defaults.js";
import { resolvePalette, listThemes } from "../themes/index.js";
import { render } from "../render/renderer.js";
import { getWidget, listWidgets } from "../widgets/index.js";

// Exhaustive render matrix: every preset × every line style × themes/charsets, plus
// every widget × every theme — all must render without throwing into the (never-crash)
// render path. Locks "all permutations for line" coverage.

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
    operation: "MERGE", worktree: { mode: true, name: "app", branch: "main", originalBranch: "trunk" },
  },
  transcript: {
    recentTools: [{ name: "Edit", target: "auth.ts", done: true }, { name: "Read", done: true }],
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

const STYLES: LineStyle[] = ["inline", "powerline", "capsule"];

function cfg(over: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, colors: resolvePalette(over.theme ?? DEFAULT_CONFIG.theme), ...over };
}

// ---- preset × style ----
for (const preset of PRESET_CATALOG) {
  for (const style of STYLES) {
    test(`preset "${preset.id}" renders as ${style}`, () => {
      const lines = preset.lines.map((l) => ({ ...l, style }));
      const out = render({ input: INPUT, data: DATA, config: cfg({ preset: preset.id, lines }) });
      assert.equal(typeof out, "string");
      const visible = strip(out).split("\n").filter((l) => l.trim().length > 0);
      assert.ok(visible.length <= preset.lineCount, `${preset.id}/${style}: ${visible.length} > ${preset.lineCount} lines`);
    });
  }
}

test("presets cover every line count 1..MAX_LAYERS", () => {
  const counts = new Set(PRESET_CATALOG.map((p) => p.lineCount));
  for (let n = 1; n <= MAX_LAYERS; n++) assert.ok(counts.has(n), `no preset with ${n} lines`);
});

// ---- showWhen: "activity" line culling ----
test("activity lines cull without activity and show with it", () => {
  const line = { style: "inline" as LineStyle, showWhen: "always" as const, widgets: [{ id: "activity.tools" }] };
  const withActivity = render({ input: INPUT, data: DATA, config: cfg({ lines: [{ ...line, showWhen: "activity" }] }) });
  assert.ok(strip(withActivity).includes("Edit"), "should show tools when active");
  const noActivity = render({ input: INPUT, data: {}, config: cfg({ lines: [{ ...line, showWhen: "activity" }] }) });
  assert.equal(noActivity, "", "activity line should cull when nothing is active");
});

// ---- global option permutations on a representative config ----
const CHARSETS = ["unicode", "text"] as const;
const DEPTHS: ColorDepth[] = ["auto", "ansi", "ansi256", "truecolor", "none"];
for (const charset of CHARSETS) {
  for (const minimalist of [false, true]) {
    for (const depth of DEPTHS) {
      test(`render combo charset=${charset} minimalist=${minimalist} depth=${depth}`, () => {
        const out = render({
          input: INPUT, data: DATA,
          config: cfg({ charset, minimalist, colorDepth: depth, preset: "full", lines: DEFAULT_CONFIG.lines }),
        });
        assert.equal(typeof out, "string");
        if (depth === "none") assert.equal(out, strip(out), "depth=none must emit no ANSI");
        if (minimalist) assert.ok(!strip(out).includes("Context "), "minimalist drops labels");
      });
    }
  }
}

// ---- every widget × every theme renders without throwing ----
test("all widgets render under all themes without throwing", () => {
  for (const theme of listThemes()) {
    const ctx: RenderContext = { input: INPUT, data: DATA, config: cfg({ theme }) };
    for (const meta of listWidgets()) {
      const wdg = getWidget(meta.id)!;
      const segs = wdg.render(wdg.collect(ctx), {}, ctx);
      assert.ok(Array.isArray(segs), `${meta.id}@${theme} did not return segments`);
    }
  }
});

// ---- the wired 1M badge actually appears in the default essential preset ----
test("default essential preset shows the 1M badge on a 1M model", () => {
  const oneM: StatuslineInput = {
    ...INPUT,
    model: { id: "claude-opus-4-8[1m]", display_name: "Claude Opus 4.8 (1M context)" },
  };
  const out = strip(render({ input: oneM, data: DATA, config: cfg({}) }));
  assert.ok(out.includes("1M"), `essential should show 1M badge, got: ${out}`);
  // ...and NOT on a non-1M model
  const plain = strip(render({ input: INPUT, data: DATA, config: cfg({}) }));
  assert.ok(!plain.includes(" 1M"), `non-1M should not show badge, got: ${plain}`);
});
