// Theme system: multiple built-in palettes + user custom colors.
//
// A theme is a map of semantic color keys -> color values. Color values are
// resolved by the color layer and may be: a named ANSI color ("cyan", "dim"),
// a 256-color index ("208"), or a truecolor hex ("#ff6600").
//
// Resolution order for the final palette the renderer uses:
//   built-in theme  <  user config "colors" overrides
// So a user can pick a theme AND tweak individual keys, exactly like
// ccstatusline's per-widget color overrides on top of a base theme.

export type ThemeColors = Record<string, string>;

export interface Theme {
  name: string;
  description: string;
  colors: ThemeColors;
}

// Semantic keys every theme should define. Widgets reference these names.
export const THEME_KEYS = [
  "model",
  "cwd",
  "git",
  "gitBranch",
  "context",
  "usage",
  "warning",
  "critical",
  "label",
  "paceGood",
  "paceBad",
  "barFilled",
  "barEmpty",
  "activeTool",
  "doneTool",
  "agent",
  "todo",
] as const;

// "hud-clean" is the default — Claude HUD's restrained palette.
const HUD_CLEAN: Theme = {
  name: "hud-clean",
  description: "Claude HUD's clean default palette",
  colors: {
    model: "cyan",
    cwd: "yellow",
    git: "magenta",
    gitBranch: "cyan",
    context: "green",
    usage: "brightBlue",
    warning: "yellow",
    critical: "red",
    label: "dim",
    paceGood: "green",
    paceBad: "red",
    barFilled: "green",
    barEmpty: "gray",
    activeTool: "yellow",
    doneTool: "green",
    agent: "magenta",
    todo: "brightBlue",
  },
};

const TOKYO_NIGHT: Theme = {
  name: "tokyo-night",
  description: "Deep blue, neon-inspired",
  colors: {
    model: "#7dcfff",
    cwd: "#e0af68",
    git: "#bb9af7",
    gitBranch: "#7aa2f7",
    context: "#9ece6a",
    usage: "#7aa2f7",
    warning: "#e0af68",
    critical: "#f7768e",
    label: "#565f89",
    paceGood: "#9ece6a",
    paceBad: "#f7768e",
    barFilled: "#9ece6a",
    barEmpty: "#414868",
    activeTool: "#e0af68",
    doneTool: "#9ece6a",
    agent: "#bb9af7",
    todo: "#7aa2f7",
  },
};

const GRUVBOX: Theme = {
  name: "gruvbox",
  description: "Warm retro earth tones",
  colors: {
    model: "#83a598",
    cwd: "#fabd2f",
    git: "#d3869b",
    gitBranch: "#8ec07c",
    context: "#b8bb26",
    usage: "#83a598",
    warning: "#fabd2f",
    critical: "#fb4934",
    label: "#928374",
    paceGood: "#b8bb26",
    paceBad: "#fb4934",
    barFilled: "#b8bb26",
    barEmpty: "#504945",
    activeTool: "#fabd2f",
    doneTool: "#b8bb26",
    agent: "#d3869b",
    todo: "#83a598",
  },
};

const NORD: Theme = {
  name: "nord",
  description: "Arctic, north-bluish palette",
  colors: {
    model: "#88c0d0",
    cwd: "#ebcb8b",
    git: "#b48ead",
    gitBranch: "#81a1c1",
    context: "#a3be8c",
    usage: "#81a1c1",
    warning: "#ebcb8b",
    critical: "#bf616a",
    label: "#4c566a",
    paceGood: "#a3be8c",
    paceBad: "#bf616a",
    barFilled: "#a3be8c",
    barEmpty: "#3b4252",
    activeTool: "#ebcb8b",
    doneTool: "#a3be8c",
    agent: "#b48ead",
    todo: "#81a1c1",
  },
};

const MONO: Theme = {
  name: "mono",
  description: "No color (NO_COLOR friendly / ASCII terminals)",
  colors: Object.fromEntries(THEME_KEYS.map((k) => [k, "default"])),
};

export const THEMES: Record<string, Theme> = {
  "hud-clean": HUD_CLEAN,
  "tokyo-night": TOKYO_NIGHT,
  gruvbox: GRUVBOX,
  nord: NORD,
  mono: MONO,
};

export function listThemes(): string[] {
  return Object.keys(THEMES);
}

/**
 * Resolve the final palette: start from the named theme (or hud-clean),
 * then layer the user's custom `colors` overrides on top.
 */
export function resolvePalette(themeName: string, overrides: ThemeColors = {}): ThemeColors {
  const base = THEMES[themeName] ?? THEMES["hud-clean"];
  return { ...base.colors, ...overrides };
}
