import type { Charset } from "../types.js";

// Progress-bar styles, inspired by claude-powerline's catalog.
// Each style is [filledChar, emptyChar]; "text" charset uses ASCII fallbacks.

const STYLES: Record<string, { unicode: [string, string]; text: [string, string] }> = {
  blocks: { unicode: ["█", "░"], text: ["#", "-"] },
  bar: { unicode: ["▓", "░"], text: ["=", "-"] },
  line: { unicode: ["━", "┄"], text: ["-", " "] },
  dots: { unicode: ["●", "○"], text: ["*", "."] },
  // claude-powerline parity (10 total).
  ball: { unicode: ["⬤", "◯"], text: ["o", "."] },
  squares: { unicode: ["■", "□"], text: ["#", "."] },
  geometric: { unicode: ["◆", "◇"], text: [">", "."] },
  filled: { unicode: ["█", " "], text: ["#", " "] },
  capped: { unicode: ["▰", "▱"], text: ["=", "."] },
  "blocks-line": { unicode: ["▬", "▭"], text: ["=", "-"] },
};

export type BarStyle = keyof typeof STYLES;

export function renderBar(
  pct: number,
  width = 10,
  style: BarStyle = "blocks",
  charset: Charset = "unicode",
): { filled: string; empty: string } {
  const clamped = Math.max(0, Math.min(100, pct));
  const filledCount = Math.round((clamped / 100) * width);
  const def = STYLES[style] ?? STYLES.blocks;
  const [f, e] = charset === "text" ? def.text : def.unicode;
  return {
    filled: f.repeat(filledCount),
    empty: e.repeat(width - filledCount),
  };
}

/** Pick a semantic color key for a usage/context level. */
export function thresholdColor(
  pct: number,
  warn = 60,
  crit = 85,
): "context" | "warning" | "critical" {
  if (pct >= crit) return "critical";
  if (pct >= warn) return "warning";
  return "context";
}
