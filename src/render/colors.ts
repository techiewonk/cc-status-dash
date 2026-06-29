import type { ColorDepth, Config } from "../types.js";

// Minimal ANSI color layer. Default aesthetic follows Claude HUD's clean palette;
// 256/truecolor are supported but only kick in when a widget/theme asks for them.

const RESET = "[0m";

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
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  return true;
}

function resolveColorKey(key: string | undefined, config: Config): string | undefined {
  if (!key) return undefined;
  // Allow theme indirection: a color value may name another theme color.
  return config.colors[key] ?? key;
}

function fgCode(value: string): string | null {
  if (value === "dim") return "[2m";
  if (value.startsWith("#")) {
    const [r, g, b] = hexToRgb(value);
    return `[38;2;${r};${g};${b}m`;
  }
  if (/^\d+$/.test(value)) return `[38;5;${value}m`;
  const named = NAMED[value];
  return named ? `[${named}m` : null;
}

function bgCode(value: string): string | null {
  if (value.startsWith("#")) {
    const [r, g, b] = hexToRgb(value);
    return `[48;2;${r};${g};${b}m`;
  }
  if (/^\d+$/.test(value)) return `[48;5;${value}m`;
  const named = NAMED[value];
  return named ? `[${named + 10}m` : null;
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
  /** Raw fg color of a resolved key, for renderers that need separator colors. */
  rawFg(key?: string): string;
}

export function createPainter(config: Config): Painter {
  const enabled = colorsEnabled(config.colorDepth);
  return {
    paint(text, opts) {
      if (!enabled || (!opts.color && !opts.bgColor && !opts.bold)) return text;
      let codes = "";
      if (opts.bold) codes += "[1m";
      const fg = fgCode(resolveColorKey(opts.color, config) ?? "");
      const bg = bgCode(resolveColorKey(opts.bgColor, config) ?? "");
      if (fg) codes += fg;
      if (bg) codes += bg;
      return codes ? `${codes}${text}${RESET}` : text;
    },
    rawFg(key) {
      if (!enabled) return "";
      const fg = fgCode(resolveColorKey(key, config) ?? "");
      return fg ?? "";
    },
  };
}

export const ANSI_RESET = RESET;
