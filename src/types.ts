// Core types for cc-status-dash.
// These model the JSON Claude Code sends on stdin, the resolved config,
// and the widget/segment contracts that both the formatter and HUD widgets share.

// NOTE: This schema is grounded in the real Claude Code stdin payload
// (verified against Claude HUD's src/types.ts, June 2026). Key gotchas:
//   - context metrics live under `context_window`, not `context`
//   - `rate_limits.*.resets_at` is an epoch number (sometimes ISO string)
//   - `effort` may be a bare string OR an object `{ level }` on newer CC
/** The JSON object Claude Code pipes to a statusLine command on stdin. */
export interface StatuslineInput {
  model?: { id?: string; display_name?: string };
  workspace?: { current_dir?: string; project_dir?: string; git_worktree?: string } | null;
  cwd?: string;
  session_id?: string;
  version?: string;
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
  /** Native rate-limit data (CC >= 2.1.80, subscriber accounts). */
  rate_limits?: {
    five_hour?: RateLimitWindow | null;
    seven_day?: RateLimitWindow | null;
  } | null;
  effort?: string | { level?: string | null; [k: string]: unknown } | null;
  [key: string]: unknown;
}

export interface RateLimitWindow {
  used_percentage?: number | null;
  resets_at?: number | string | null; // epoch ms (usually) or ISO string
}

/** Where a widget gets its data — lets the loader skip expensive providers. */
export type DataSource = "stdin" | "git" | "transcript" | "rate_limits" | "system";

export type WidgetCategory =
  | "model"
  | "context"
  | "usage"
  | "git"
  | "activity"
  | "system"
  | "custom";

/** A styled chunk of output. Renderers turn Segment[] into a string. */
export interface Segment {
  text: string;
  /** Named theme color key, 256-color number, or #hex. Optional. */
  color?: string;
  bgColor?: string;
  bold?: boolean;
}

export interface WidgetOptions {
  [key: string]: unknown;
}

/** Everything a widget needs to do its job for one render. */
export interface RenderContext {
  input: StatuslineInput;
  config: Config;
  /** Lazily-populated provider results, keyed by DataSource. */
  data: ProviderData;
}

export interface ProviderData {
  git?: GitInfo;
  transcript?: TranscriptInfo;
  system?: SystemInfo;
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  dirty?: boolean;
  ahead?: number;
  behind?: number;
  staged?: number;
  unstaged?: number;
  untracked?: number;
  insertions?: number;
  deletions?: number;
}

export interface TranscriptInfo {
  /** Most recent tool uses, newest first. */
  recentTools: { name: string; target?: string; done: boolean }[];
  /** Active/recent subagents. */
  agents: { name: string; model?: string; status?: string; elapsedSec?: number }[];
  /** Current todo list progress. */
  todos: { total: number; completed: number; current?: string };
  /** ms since the last user message (for cache-TTL style timers). */
  msSinceLastUser?: number;
}

export interface SystemInfo {
  memUsedPct?: number;
  tmuxSession?: string;
}

/** A widget: the single contract both formatter and HUD widgets implement. */
export interface Widget<TData = unknown> {
  id: string;
  category: WidgetCategory;
  label: string;
  needs: DataSource[];
  collect(ctx: RenderContext): TData;
  /** Return [] to render nothing — empty widgets are auto-culled. */
  render(data: TData, opts: WidgetOptions, ctx: RenderContext): Segment[];
}

// ---- Configuration ----

export type LineStyle = "inline" | "powerline";
export type Charset = "unicode" | "text";
export type ColorDepth = "auto" | "ansi" | "ansi256" | "truecolor" | "none";

export interface WidgetConfig {
  id: string;
  [option: string]: unknown;
}

export interface LineConfig {
  style?: LineStyle;
  /** When "activity", the whole line is hidden if every widget renders empty. */
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
  lines: LineConfig[];
  colors: Record<string, string>;
}
