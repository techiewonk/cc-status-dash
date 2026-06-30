// Core types for cc-status-dash.
// Schema grounded in the real Claude Code stdin payload (verified against
// Claude HUD's src/types.ts). Widget/segment contracts are shared by both the
// formatter widgets (ccstatusline-style) and the HUD activity widgets.

export interface StatuslineInput {
  model?: { id?: string; display_name?: string };
  workspace?: { current_dir?: string; project_dir?: string; git_worktree?: string; added_dirs?: string[] } | null;
  cwd?: string;
  session_id?: string;
  session_name?: string;
  version?: string;
  output_style?: { name?: string } | string;
  /** Editor vim mode when the user has vim keybindings on (e.g. `NORMAL`/`INSERT`). */
  vim?: { mode?: string } | null;
  transcript_path?: string;
  context_window?: {
    context_window_size?: number;
    used_percentage?: number | null;
    remaining_percentage?: number | null;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
  cost?: {
    total_cost_usd?: number | null;
    total_duration_ms?: number | null;
    total_api_duration_ms?: number | null;
    total_lines_added?: number | null;
    total_lines_removed?: number | null;
  } | null;
  rate_limits?: {
    five_hour?: RateLimitWindow | null;
    seven_day?: RateLimitWindow | null;
  } | null;
  effort?: string | { level?: string | null; [k: string]: unknown } | null;
  [key: string]: unknown;
}

export interface RateLimitWindow {
  used_percentage?: number | null;
  resets_at?: number | string | null; // epoch SECONDS (Claude Code) — normalized via epochMs(); ms/ISO also accepted
}

export type DataSource = "stdin" | "git" | "transcript" | "rate_limits" | "system" | "stats";

export type WidgetCategory =
  | "model"
  | "context"
  | "tokens"
  | "usage"
  | "git"
  | "activity"
  | "system"
  | "custom";

export interface Segment {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
}

export interface WidgetOptions {
  [key: string]: unknown;
}

export interface RenderContext {
  input: StatuslineInput;
  config: Config;
  data: ProviderData;
}

export interface ProviderData {
  stats?: StatsInfo;
  git?: GitInfo;
  transcript?: TranscriptInfo;
  system?: SystemInfo;
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  dirty?: boolean;
  clean?: boolean;
  ahead?: number;
  behind?: number;
  staged?: number;
  unstaged?: number;
  untracked?: number;
  conflicts?: number;
  insertions?: number;
  deletions?: number;
  /** Per-file unstaged diff stats (only collected when a `git.files` widget is active). */
  files?: { path: string; added: number; removed: number }[];
  sha?: string;
  rootDir?: string;
  originOwner?: string;
  originRepo?: string;
  upstreamOwner?: string;
  upstreamRepo?: string;
  isFork?: boolean;
  stash?: number;
  tag?: string;
  secondsSinceCommit?: number;
  operation?: string;
  submodules?: number;
  commitCount?: number;
  worktree?: { mode?: boolean; name?: string; branch?: string; originalBranch?: string };
}

export interface TranscriptInfo {
  recentTools: { name: string; target?: string; done: boolean }[];
  /** Per-tool tallies (Claude HUD style): `Bash ×12`, with the in-flight tool flagged. */
  toolCounts: { name: string; count: number; running: boolean }[];
  agents: { name: string; model?: string; description?: string; status?: string; elapsedSec?: number }[];
  todos: { total: number; completed: number; current?: string };
  skills: string[];
  mcpServers: string[];
  sessionName?: string;
  /** Canonical advisor model id (e.g. `claude-opus-4-7`) stamped on assistant records after `/advisor`. */
  advisorModel?: string;
  /** Epoch ms of the transcript's first entry (session start), for session-age widgets. */
  sessionStart?: number;
  sessionTokens?: { input: number; output: number; cacheCreation: number; cacheRead: number };
  compactionCount?: number;
  msSinceLastUser?: number;
  lastResponseMs?: number;
}

export interface StatsInfo {
  sessionCost?: number;
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  /** tokens per second over the configured window */
  tokenSpeed: { input: number; output: number; total: number };
  messageCount: number;
}

export interface SystemInfo {
  memUsedPct?: number;
  memUsedBytes?: number;
  memTotalBytes?: number;
  tmuxSession?: string;
  terminalWidth?: number;
  accountEmail?: string;
  claudeMdCount?: number;
  mcpConfigCount?: number;
  hooksCount?: number;
  rulesCount?: number;
  /** `voice.enabled` from layered settings (undefined = Claude Code never initialised). */
  voiceEnabled?: boolean;
  /** Remote-control bridge attached to the current session (undefined = no manifest). */
  remoteControlEnabled?: boolean;
}

export interface Widget<TData = unknown> {
  id: string;
  category: WidgetCategory;
  label: string;
  needs: DataSource[];
  collect(ctx: RenderContext): TData;
  render(data: TData, opts: WidgetOptions, ctx: RenderContext): Segment[];
}

// ---- Configuration ----

export type LineStyle = "inline" | "powerline" | "capsule";
export type Charset = "unicode" | "text";
export type ColorDepth = "auto" | "ansi" | "ansi256" | "truecolor" | "none";

export interface WidgetConfig {
  id: string;
  [option: string]: unknown;
}

export interface LineConfig {
  style?: LineStyle;
  showWhen?: "always" | "activity";
  widgets: WidgetConfig[];
}

export interface Config {
  /** Preset id from the catalog (see config/defaults.ts), or "custom". */
  preset: string;
  charset: Charset;
  theme: string;
  colorDepth: ColorDepth;
  refreshInterval?: number;
  separator: string;
  /** Global options (ccstatusline parity). */
  minimalist: boolean;   // strip labels, raw values only
  globalBold: boolean;   // force bold on all segments
  padding: number;       // spaces of padding around each segment's text
  autoWrap: boolean;     // wrap inline lines to terminal width
  lines: LineConfig[];
  /** Optional per-model context-window limits (tokens). */
  modelContextLimits?: { sonnet?: number; opus?: number; haiku?: number; default?: number };
  /** Powerline separator glyph by name (arrow | round | triangle | flame | pixel). */
  powerlineSeparator?: string;
  /** Powerline end caps: round | flame | none (left/right rounded edges around the bar). */
  powerlineCaps?: string;
  /** Force this foreground color on every segment (global override, ccstatusline parity). */
  overrideForeground?: string;
  /** Force this background color on every segment. */
  overrideBackground?: string;
  colors: Record<string, string>;
}
