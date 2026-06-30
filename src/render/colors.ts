import type { ColorDepth, Config } from "../types.js";

// Minimal ANSI color layer. Default aesthetic follows Claude HUD's clean palette;
// 256/truecolor are supported but only kick in when a widget/theme asks for them.
// Hex/256 colors are downsampled to honor the effective color depth.

const RESET = "\x1b[0m";

const NAMED: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
};

function colorsEnabled(depth: ColorDepth): boolean {
  if (depth === "none") return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "0") return false; // chalk/supports-color convention: force-disable
  return true;
}

/** Effective depth: resolves "auto" from COLORTERM / FORCE_COLOR / TERM. */
type RealDepth = "truecolor" | "ansi256" | "ansi";
function effectiveDepth(depth: ColorDepth): RealDepth {
  if (depth === "truecolor" || depth === "ansi256" || depth === "ansi") return depth;
  // depth === "auto" (or "none", handled earlier): sniff the environment.
  const ct = process.env.COLORTERM;
  if (ct === "truecolor" || ct === "24bit" || process.env.FORCE_COLOR === "3") return "truecolor";
  if (process.env.FORCE_COLOR === "2" || /256/.test(process.env.TERM ?? "")) return "ansi256";
  if (process.env.FORCE_COLOR === "1") return "ansi";
  return "truecolor"; // assume a modern terminal when no signal (preserves prior behavior)
}

function resolveColorKey(key: string | undefined, config: Config): string | undefined {
  if (!key) return undefined;
  // Allow theme indirection: a color value may name another theme color.
  return config.colors[key] ?? key;
}

// ---- depth downsampling (truecolor → 256 → 16), mirrors ansi-styles ----
function rgbToAnsi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  return 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);
}
/** ANSI-256 index → base SGR code (30-37 / 90-97). */
function ansi256ToBase(code: number): number {
  if (code < 8) return 30 + code;
  if (code < 16) return 90 + (code - 8);
  let r: number, g: number, b: number;
  if (code >= 232) {
    r = g = b = ((code - 232) * 10 + 8) / 255;
  } else {
    const c = code - 16;
    const rem = c % 36;
    r = Math.floor(c / 36) / 5;
    g = Math.floor(rem / 6) / 5;
    b = (rem % 6) / 5;
  }
  const value = Math.max(r, g, b) * 2;
  if (value === 0) return 30;
  let base = 30 + ((Math.round(b) << 2) | (Math.round(g) << 1) | Math.round(r));
  if (value === 2) base += 60;
  return base;
}
function rgbToBase16(r: number, g: number, b: number): number {
  return ansi256ToBase(rgbToAnsi256(r, g, b));
}

function fgCode(value: string, depth: RealDepth): string | null {
  if (value === "dim") return "\x1b[2m";
  if (value.startsWith("#")) {
    const [r, g, b] = hexToRgb(value);
    if (depth === "truecolor") return `\x1b[38;2;${r};${g};${b}m`;
    if (depth === "ansi256") return `\x1b[38;5;${rgbToAnsi256(r, g, b)}m`;
    return `\x1b[${rgbToBase16(r, g, b)}m`;
  }
  if (/^\d+$/.test(value)) {
    if (depth === "ansi") return `\x1b[${ansi256ToBase(Number(value))}m`;
    return `\x1b[38;5;${value}m`;
  }
  const named = NAMED[value];
  return named ? `\x1b[${named}m` : null;
}

function bgCode(value: string, depth: RealDepth): string | null {
  // claude-powerline parity: explicit "no background".
  if (value === "none" || value === "transparent") return null;
  if (value.startsWith("#")) {
    const [r, g, b] = hexToRgb(value);
    if (depth === "truecolor") return `\x1b[48;2;${r};${g};${b}m`;
    if (depth === "ansi256") return `\x1b[48;5;${rgbToAnsi256(r, g, b)}m`;
    return `\x1b[${rgbToBase16(r, g, b) + 10}m`;
  }
  if (/^\d+$/.test(value)) {
    if (depth === "ansi") return `\x1b[${ansi256ToBase(Number(value)) + 10}m`;
    return `\x1b[48;5;${value}m`;
  }
  const named = NAMED[value];
  return named ? `\x1b[${named + 10}m` : null;
}

/** Interpolate a hex color across `stops` (>=2 hex colors) at position t∈[0,1].
 * Returns a `#rrggbb` string. Used by line gradients. */
export function gradientAt(stops: string[], t: number): string {
  const valid = stops.filter((s) => typeof s === "string" && s.startsWith("#"));
  if (valid.length === 0) return "#ffffff";
  if (valid.length === 1) return valid[0];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (valid.length - 1);
  const i = Math.min(valid.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const [r1, g1, b1] = hexToRgb(valid[i]);
  const [r2, g2, b2] = hexToRgb(valid[i + 1]);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
  const hx = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hx(mix(r1, r2))}${hx(mix(g1, g2))}${hx(mix(b1, b2))}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

export interface Painter {
  paint(text: string, opts: { color?: string; bgColor?: string; bold?: boolean }): string;
}

export function createPainter(config: Config): Painter {
  const enabled = colorsEnabled(config.colorDepth);
  const depth = effectiveDepth(config.colorDepth);
  // Global FG/BG overrides force a single color across every segment (ccstatusline parity).
  const ovFg = typeof config.overrideForeground === "string" ? config.overrideForeground : undefined;
  const ovBg = typeof config.overrideBackground === "string" ? config.overrideBackground : undefined;
  return {
    paint(text, opts) {
      const colorKey = ovFg ?? opts.color;
      const bgKey = ovBg ?? opts.bgColor;
      if (!enabled || (!colorKey && !bgKey && !opts.bold)) return text;
      let codes = "";
      if (opts.bold) codes += "\x1b[1m";
      const fg = fgCode(resolveColorKey(colorKey, config) ?? "", depth);
      const bg = bgCode(resolveColorKey(bgKey, config) ?? "", depth);
      if (fg) codes += fg;
      if (bg) codes += bg;
      return codes ? `${codes}${text}${RESET}` : text;
    },
  };
}

export const ANSI_RESET = RESET;
