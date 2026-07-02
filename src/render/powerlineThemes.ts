import type { RealDepth } from "./colors.js";

// Powerline color-cycling themes (ccstatusline parity, `utils/colors.ts`): a set
// of depth-aware named palettes, distinct from our role-based theme system. Each
// entry has 5 fg/bg color slots per color depth (16/256/truecolor); powerline mode
// cycles a widget's position through them (position % 5) instead of the default
// 3-role bgCycle, so segments visually rotate through the palette left → right.

interface DepthPalette { fg: string[]; bg: string[] }
interface PowerlineTheme { name: string; description: string; ansi: DepthPalette; ansi256: DepthPalette; truecolor: DepthPalette }

/** ccstatusline token → our color-string format: `hex:XXXXXX` → `#XXXXXX`,
 * `ansi256:N` → `N`, an ANSI-16 name (optionally `bg`-prefixed for a background
 * slot) → our NAMED-map key. `brightWhite`/`brightBlack` aren't in our 16-color
 * NAMED map (colors.ts); mapped to their nearest equivalent (hex white, and our
 * literal "gray" which is the same ANSI code 90 that "bright black" denotes). */
function toOurColor(raw: string): string {
  if (raw.startsWith("hex:")) return `#${raw.slice(4)}`;
  if (raw.startsWith("ansi256:")) return raw.slice(8);
  const bare = raw.startsWith("bg") ? raw[2].toLowerCase() + raw.slice(3) : raw;
  if (bare === "brightWhite") return "#ffffff";
  if (bare === "brightBlack") return "gray";
  return bare;
}
function pal(fg: string[], bg: string[]): DepthPalette {
  return { fg: fg.map(toOurColor), bg: bg.map(toOurColor) };
}

export const POWERLINE_THEMES: Record<string, PowerlineTheme> = {
  nord: {
    name: "Nord", description: "Arctic, north-bluish color palette",
    ansi: pal(["black", "brightWhite", "brightWhite", "black", "black"], ["bgBrightCyan", "bgBrightBlack", "bgBlue", "bgBrightYellow", "bgBrightGreen"]),
    ansi256: pal(["ansi256:16", "ansi256:254", "ansi256:231", "ansi256:231", "ansi256:16"], ["ansi256:73", "ansi256:239", "ansi256:25", "ansi256:96", "ansi256:152"]),
    truecolor: pal(["hex:2E3440", "hex:D8DEE9", "hex:FDF6E3", "hex:2E3440", "hex:2E3440"], ["hex:88C0D0", "hex:4C566A", "hex:5E81AC", "hex:B48EAD", "hex:A3BE8C"]),
  },
  "nord-aurora": {
    name: "Nord Aurora", description: "Nord theme with aurora colors",
    ansi: pal(["brightWhite", "black", "black", "black", "black"], ["bgRed", "bgBrightYellow", "bgBrightBlue", "bgGreen", "bgBrightMagenta"]),
    ansi256: pal(["ansi256:231", "ansi256:16", "ansi256:231", "ansi256:16", "ansi256:16"], ["ansi256:131", "ansi256:220", "ansi256:68", "ansi256:108", "ansi256:176"]),
    truecolor: pal(["hex:ECEFF4", "hex:2E3440", "hex:FDF6E3", "hex:2E3440", "hex:2E3440"], ["hex:BF616A", "hex:EBCB8B", "hex:5E81AC", "hex:A3BE8C", "hex:B48EAD"]),
  },
  monokai: {
    name: "Monokai", description: "Dark background with vibrant colors",
    ansi: pal(["black", "brightWhite", "black", "white", "black"], ["bgBrightGreen", "bgBrightBlack", "bgBrightYellow", "bgMagenta", "bgBrightCyan"]),
    ansi256: pal(["ansi256:235", "ansi256:255", "ansi256:235", "ansi256:16", "ansi256:235"], ["ansi256:148", "ansi256:238", "ansi256:186", "ansi256:141", "ansi256:81"]),
    truecolor: pal(["hex:272822", "hex:F8F8F2", "hex:272822", "hex:272822", "hex:272822"], ["hex:A6E22E", "hex:49483E", "hex:E6DB74", "hex:AE81FF", "hex:66D9EF"]),
  },
  solarized: {
    name: "Solarized", description: "Precision colors for readability",
    ansi: pal(["brightWhite", "black", "brightWhite", "black", "black"], ["bgBlue", "bgBrightYellow", "bgBrightBlack", "bgCyan", "bgBrightWhite"]),
    ansi256: pal(["ansi256:231", "ansi256:234", "ansi256:254", "ansi256:16", "ansi256:234"], ["ansi256:33", "ansi256:136", "ansi256:240", "ansi256:37", "ansi256:254"]),
    truecolor: pal(["hex:073642", "hex:073642", "hex:FDF6E3", "hex:073642", "hex:073642"], ["hex:268BD2", "hex:B58900", "hex:586E75", "hex:2AA198", "hex:EEE8D5"]),
  },
  minimal: {
    name: "Minimal", description: "Clean monochrome theme",
    ansi: pal(["brightWhite", "black", "white", "black", "black"], ["bgBrightBlack", "bgBrightWhite", "bgBlack", "bgWhite", "bgBrightWhite"]),
    ansi256: pal(["ansi256:255", "ansi256:232", "ansi256:255", "ansi256:232", "ansi256:252"], ["ansi256:240", "ansi256:251", "ansi256:233", "ansi256:248", "ansi256:236"]),
    truecolor: pal(["hex:FFFFFF", "hex:1C1C1C", "hex:FFFFFF", "hex:1C1C1C", "hex:E4E4E4"], ["hex:585858", "hex:D0D0D0", "hex:1A1A1A", "hex:A8A8A8", "hex:303030"]),
  },
  dracula: {
    name: "Dracula", description: "Dark theme with purple accents",
    ansi: pal(["brightWhite", "black", "brightWhite", "black", "white"], ["bgMagenta", "bgBrightWhite", "bgRed", "bgBrightCyan", "bgBrightBlack"]),
    ansi256: pal(["ansi256:235", "ansi256:235", "ansi256:235", "ansi256:235", "ansi256:231"], ["ansi256:141", "ansi256:253", "ansi256:204", "ansi256:117", "ansi256:236"]),
    truecolor: pal(["hex:282A36", "hex:282A36", "hex:282A36", "hex:282A36", "hex:F8F8F2"], ["hex:BD93F9", "hex:F8F8F2", "hex:FF5555", "hex:8BE9FD", "hex:44475A"]),
  },
  catppuccin: {
    name: "Catppuccin", description: "Soothing pastel theme",
    ansi: pal(["black", "brightWhite", "black", "brightWhite", "black"], ["bgBrightMagenta", "bgBrightBlack", "bgBrightGreen", "bgBlue", "bgBrightYellow"]),
    ansi256: pal(["ansi256:235", "ansi256:255", "ansi256:235", "ansi256:235", "ansi256:235"], ["ansi256:176", "ansi256:238", "ansi256:150", "ansi256:210", "ansi256:111"]),
    truecolor: pal(["hex:1E1E2E", "hex:CDD6F4", "hex:1E1E2E", "hex:1E1E2E", "hex:CDD6F4"], ["hex:CBA6F7", "hex:45475A", "hex:A6E3A1", "hex:F38BA8", "hex:585B70"]),
  },
  gruvbox: {
    name: "Gruvbox", description: "Retro groove color scheme",
    ansi: pal(["brightWhite", "black", "black", "brightWhite", "black"], ["bgRed", "bgBrightYellow", "bgBrightWhite", "bgBlue", "bgBrightGreen"]),
    ansi256: pal(["ansi256:16", "ansi256:235", "ansi256:235", "ansi256:16", "ansi256:235"], ["ansi256:167", "ansi256:214", "ansi256:246", "ansi256:109", "ansi256:142"]),
    truecolor: pal(["hex:EBDBB2", "hex:282828", "hex:282828", "hex:FDF6E3", "hex:282828"], ["hex:CC241D", "hex:FABD2F", "hex:A89984", "hex:458588", "hex:98971A"]),
  },
  onedark: {
    name: "One Dark", description: "Atom-inspired dark theme",
    ansi: pal(["black", "brightWhite", "black", "brightWhite", "black"], ["bgBrightBlue", "bgBrightBlack", "bgBrightGreen", "bgRed", "bgBrightYellow"]),
    ansi256: pal(["ansi256:235", "ansi256:251", "ansi256:235", "ansi256:16", "ansi256:235"], ["ansi256:75", "ansi256:237", "ansi256:114", "ansi256:204", "ansi256:180"]),
    truecolor: pal(["hex:282C34", "hex:ABB2BF", "hex:282C34", "hex:282C34", "hex:282C34"], ["hex:61AFEF", "hex:3E4452", "hex:98C379", "hex:E06C75", "hex:E5C07B"]),
  },
  tokyonight: {
    name: "Tokyo Night", description: "Clean, dark theme inspired by Tokyo nightlife",
    ansi: pal(["brightWhite", "black", "brightWhite", "black", "black"], ["bgBlue", "bgBrightWhite", "bgMagenta", "bgBrightYellow", "bgBrightCyan"]),
    ansi256: pal(["ansi256:16", "ansi256:234", "ansi256:16", "ansi256:234", "ansi256:234"], ["ansi256:111", "ansi256:248", "ansi256:176", "ansi256:221", "ansi256:80"]),
    truecolor: pal(["hex:1A1B26", "hex:1A1B26", "hex:1A1B26", "hex:1A1B26", "hex:1A1B26"], ["hex:7AA2F7", "hex:D5D6DB", "hex:BB9AF7", "hex:E0AF68", "hex:7DCFFF"]),
  },
};

export function listPowerlineThemes(): string[] {
  return Object.keys(POWERLINE_THEMES);
}

/** Resolve `name` at the render's effective color depth, or undefined for an
 * unknown/unset theme name (falls back to the existing role-based bgCycle). */
export function getPowerlineTheme(name: string | undefined, depth: RealDepth): DepthPalette | undefined {
  if (!name) return undefined;
  const theme = POWERLINE_THEMES[name];
  if (!theme) return undefined;
  return theme[depth];
}
