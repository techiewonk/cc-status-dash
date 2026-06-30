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
  "usageWarning",
  "usageCritical",
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

const CATPPUCCIN: Theme = {
  name: "catppuccin",
  description: "Catppuccin Mocha — soft pastel dark",
  colors: {
    model: "#89b4fa", cwd: "#f9e2af", git: "#cba6f7", gitBranch: "#89b4fa",
    context: "#a6e3a1", usage: "#74c7ec", warning: "#f9e2af", critical: "#f38ba8",
    label: "#6c7086", paceGood: "#a6e3a1", paceBad: "#f38ba8", barFilled: "#a6e3a1",
    barEmpty: "#45475a", activeTool: "#f9e2af", doneTool: "#a6e3a1", agent: "#cba6f7", todo: "#89b4fa",
  },
};

const DRACULA: Theme = {
  name: "dracula",
  description: "Dracula — vivid neon dark",
  colors: {
    model: "#8be9fd", cwd: "#f1fa8c", git: "#ff79c6", gitBranch: "#bd93f9",
    context: "#50fa7b", usage: "#bd93f9", warning: "#f1fa8c", critical: "#ff5555",
    label: "#6272a4", paceGood: "#50fa7b", paceBad: "#ff5555", barFilled: "#50fa7b",
    barEmpty: "#44475a", activeTool: "#f1fa8c", doneTool: "#50fa7b", agent: "#ff79c6", todo: "#8be9fd",
  },
};

const ONE_DARK: Theme = {
  name: "one-dark",
  description: "Atom One Dark",
  colors: {
    model: "#61afef", cwd: "#e5c07b", git: "#c678dd", gitBranch: "#61afef",
    context: "#98c379", usage: "#56b6c2", warning: "#e5c07b", critical: "#e06c75",
    label: "#5c6370", paceGood: "#98c379", paceBad: "#e06c75", barFilled: "#98c379",
    barEmpty: "#3e4451", activeTool: "#e5c07b", doneTool: "#98c379", agent: "#c678dd", todo: "#61afef",
  },
};

const ROSE_PINE: Theme = {
  name: "rose-pine",
  description: "Rosé Pine — muted, cozy",
  colors: {
    model: "#9ccfd8", cwd: "#f6c177", git: "#c4a7e7", gitBranch: "#31748f",
    context: "#ebbcba", usage: "#9ccfd8", warning: "#f6c177", critical: "#eb6f92",
    label: "#6e6a86", paceGood: "#9ccfd8", paceBad: "#eb6f92", barFilled: "#31748f",
    barEmpty: "#26233a", activeTool: "#f6c177", doneTool: "#9ccfd8", agent: "#c4a7e7", todo: "#9ccfd8",
  },
};

// Dark text on light backgrounds (GitHub-light-ish) for light terminals.
const HUD_LIGHT: Theme = {
  name: "hud-light",
  description: "Readable on light terminal backgrounds",
  colors: {
    model: "#0969da", cwd: "#9a6700", git: "#8250df", gitBranch: "#0969da",
    context: "#1a7f37", usage: "#0550ae", warning: "#9a6700", critical: "#cf222e",
    label: "#6e7781", paceGood: "#1a7f37", paceBad: "#cf222e", barFilled: "#1a7f37",
    barEmpty: "#d0d7de", activeTool: "#9a6700", doneTool: "#1a7f37", agent: "#8250df", todo: "#0969da",
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
  catppuccin: CATPPUCCIN,
  dracula: DRACULA,
  "one-dark": ONE_DARK,
  "rose-pine": ROSE_PINE,
  "hud-light": HUD_LIGHT,
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
  const merged = { ...base.colors, ...overrides };
  // Usage-specific semantic colors fall back to the generic warning/critical when
  // a theme (or user) hasn't set them — existing themes keep working unchanged,
  // and a user can `colors.usageWarning` to recolor usage warnings alone.
  if (merged.usageWarning == null) merged.usageWarning = merged.warning;
  if (merged.usageCritical == null) merged.usageCritical = merged.critical;
  return merged;
}
