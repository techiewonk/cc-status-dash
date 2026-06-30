import type { Config, LineConfig, RenderContext, Segment, WidgetConfig } from "../types.js";
import { getWidget } from "../widgets/index.js";
import { stripVTControlCharacters } from "node:util";
import { createPainter, type Painter } from "./colors.js";

// Renders the resolved config into the final multi-line string.
// Line styles: inline / powerline / capsule. Global options honored:
// globalBold, padding, minimalist (in widgets), widget merge, and auto-wrap.

// Powerline / capsule glyphs as \u escapes so they survive editor encoding round-trips
// (they were previously stripped to empty strings, blanking arrows/caps).
const POWERLINE_SEP = ""; // right-pointing powerline arrow
const POWERLINE_SEP_TEXT = ">"; // ASCII fallback for charset:"text"
// Named powerline separator glyphs (Nerd Font), selectable via config.powerlineSeparator.
const POWERLINE_SEPS: Record<string, string> = {
  arrow: "",
  round: "",
  triangle: "",
  flame: "",
  pixel: "",
};
const CAP_LEFT = ""; // left rounded cap
const CAP_RIGHT = ""; // right rounded cap

interface BuiltWidget { segments: Segment[]; merge: boolean; }

/** Terminal cell width of a single code point: 0 (combining/zero-width), 2 (wide/CJK/emoji), else 1. */
function charWidth(cp: number): number {
  if (cp === 0) return 0;
  if (
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
    (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) || // combining marks for symbols
    (cp >= 0x200b && cp <= 0x200f) || cp === 0x200d || // zero-width (+ZWJ)
    (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff // variation selectors / BOM
  ) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || // CJK … Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat
    (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || // fullwidth
    (cp >= 0x1f000 && cp <= 0x1faff) || // emoji & symbols
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK ext B+
  ) return 2;
  return 1;
}
/** Display column width (not UTF-16 length) of an already-rendered string. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0) ?? 0);
  return w;
}
function plainLen(s: string): number {
  // Strip ANSI/VT/OSC8 (Node built-in), then measure real terminal columns so
  // wide (CJK/emoji) and zero-width chars don't misalign auto-wrap.
  return displayWidth(stripVTControlCharacters(s));
}

/**
 * Apply per-widget style overrides (`color`/`bgColor`/`bold`/`dim`) declared on
 * the WidgetConfig — ccstatusline / claude-powerline / Claude-HUD parity. `color`
 * and `dim` retint only the *value* segments (the dim "label" prefix is left
 * alone); `bgColor`/`bold` apply to the whole widget. Applied after globalBold so
 * an explicit per-widget `bold: false` can opt a widget out of the global bold.
 */
function applyWidgetStyle(segments: Segment[], wc: WidgetConfig): Segment[] {
  const color = typeof wc.color === "string" ? wc.color : undefined;
  const bgColor = typeof wc.bgColor === "string" ? wc.bgColor : undefined;
  const bold = typeof wc.bold === "boolean" ? wc.bold : undefined;
  const dim = wc.dim === true;
  if (color === undefined && bgColor === undefined && bold === undefined && !dim) return segments;
  return segments.map((s) => {
    const isLabel = s.color === "label";
    const next: Segment = { ...s };
    if (bgColor !== undefined) next.bgColor = bgColor;
    if (bold !== undefined) next.bold = bold;
    if (!isLabel) {
      if (color !== undefined) next.color = color;
      if (dim) next.color = "dim";
    }
    return next;
  });
}

/** Truncate a widget's segments to `maxWidth` display columns, appending an ellipsis.
 * ccstatusline WidgetItem.maxWidth parity. Measures real terminal columns. */
function truncateSegments(segments: Segment[], maxWidth: number): Segment[] {
  if (maxWidth <= 0) return segments;
  let total = 0;
  for (const s of segments) total += displayWidth(s.text);
  if (total <= maxWidth) return segments;
  const limit = Math.max(1, maxWidth - 1); // leave a column for the ellipsis
  const out: Segment[] = [];
  let used = 0;
  for (const s of segments) {
    const w = displayWidth(s.text);
    if (used + w <= limit) { out.push(s); used += w; continue; }
    let txt = "";
    for (const ch of s.text) {
      const cw = displayWidth(ch);
      if (used + cw > limit) break;
      txt += ch; used += cw;
    }
    if (txt) out.push({ ...s, text: txt });
    break;
  }
  out.push({ text: "…" });
  return out;
}

function buildLineWidgets(line: LineConfig, ctx: RenderContext): BuiltWidget[] {
  const built: BuiltWidget[] = [];
  const pad = " ".repeat(Math.max(0, ctx.config.padding));
  for (const wc of line.widgets) {
    const widget = getWidget(wc.id);
    if (!widget) continue;
    // A single misconfigured widget (e.g. a bad `timezone`, or a throwing
    // custom-command) must never collapse the whole statusline — cull it instead.
    let segments: Segment[];
    try {
      segments = widget.render(widget.collect(ctx), wc, ctx);
    } catch {
      continue;
    }
    if (segments.length === 0) continue;
    // Per-widget rawValue: drop the dim label prefix for just this widget (like the
    // global `minimalist`, but scoped). ccstatusline WidgetItem.rawValue parity.
    if (wc.rawValue === true) {
      segments = segments.filter((s) => s.color !== "label" && s.text.trim() !== "");
      if (segments.length === 0) continue;
    }
    // Pad first so a per-widget bgColor/bold covers the padding too (no unstyled gaps).
    if (pad) segments = [{ text: pad }, ...segments, { text: pad }];
    if (ctx.config.globalBold) segments = segments.map((s) => ({ ...s, bold: true }));
    segments = applyWidgetStyle(segments, wc);
    if (typeof wc.maxWidth === "number") segments = truncateSegments(segments, wc.maxWidth);
    built.push({ segments, merge: wc.merge === true });
  }
  return built;
}

function renderInline(built: BuiltWidget[], painter: Painter, sep: string, autoWrap: boolean): string {
  const chunks: string[] = [];
  for (const wgt of built) {
    const str = wgt.segments.map((s) => painter.paint(s.text, s)).join("");
    if (wgt.merge && chunks.length) chunks[chunks.length - 1] += str;
    else chunks.push(str);
  }
  const sepStr = ` ${painter.paint(sep, { color: "label" })} `;
  if (!autoWrap) return chunks.join(sepStr);

  const width = Number(process.env.COLUMNS) || process.stdout.columns || 80;
  const sepLen = plainLen(sepStr);
  const lines: string[] = [];
  let cur = "", curLen = 0;
  for (const c of chunks) {
    const cl = plainLen(c);
    if (cur === "") { cur = c; curLen = cl; }
    else if (curLen + sepLen + cl <= width) { cur += sepStr + c; curLen += sepLen + cl; }
    else { lines.push(cur); cur = c; curLen = cl; }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function renderCapsule(built: BuiltWidget[], painter: Painter, ctx: RenderContext): string {
  const bgCycle = ["model", "cwd", "git"];
  const lcap = ctx.config.charset === "text" ? "(" : CAP_LEFT;
  const rcap = ctx.config.charset === "text" ? ")" : CAP_RIGHT;
  return built.map((wgt, i) => {
    const bg = bgCycle[i % bgCycle.length];
    const text = wgt.segments.map((s) => s.text).join("");
    return painter.paint(lcap, { color: bg }) + painter.paint(` ${text} `, { bgColor: bg, color: "label", bold: true }) + painter.paint(rcap, { color: bg });
  }).join(" ");
}

function renderPowerline(built: BuiltWidget[], painter: Painter, ctx: RenderContext): string {
  const bgCycle = ["model", "cwd", "git"];
  const arrow = ctx.config.charset === "text"
    ? POWERLINE_SEP_TEXT
    : (POWERLINE_SEPS[ctx.config.powerlineSeparator ?? ""] ?? POWERLINE_SEP);
  let out = "";
  built.forEach((wgt, i) => {
    const bg = bgCycle[i % bgCycle.length];
    const text = " " + wgt.segments.map((s) => s.text).join("") + " ";
    out += painter.paint(text, { bgColor: bg, color: "label", bold: true });
    const nextBg = i + 1 < built.length ? bgCycle[(i + 1) % bgCycle.length] : undefined;
    out += painter.paint(arrow, { color: bg, bgColor: nextBg });
  });
  return out;
}

export function render(ctx: RenderContext): string {
  const config: Config = ctx.config;
  const painter = createPainter(config);
  const out: string[] = [];
  for (const line of config.lines) {
    const built = buildLineWidgets(line, ctx);
    if (line.showWhen === "activity" && built.length === 0) continue;
    if (built.length === 0) continue;
    out.push(
      line.style === "powerline" ? renderPowerline(built, painter, ctx)
      : line.style === "capsule" ? renderCapsule(built, painter, ctx)
      : renderInline(built, painter, config.charset === "text" && config.separator === "│" ? "|" : config.separator, config.autoWrap),
    );
  }
  return out.join("\n");
}
