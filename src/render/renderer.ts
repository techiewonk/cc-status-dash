import type { Config, LineConfig, RenderContext, Segment, WidgetConfig } from "../types.js";
import { getWidget } from "../widgets/index.js";
import { stripVTControlCharacters } from "node:util";
import { createPainter, gradientAt, type Painter } from "./colors.js";

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

interface BuiltWidget { segments: Segment[]; merge: boolean; color?: string; }

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
  // `dim: true` recolors the value to dim; `dim: "parens"` instead wraps the
  // value in dim parentheses without recoloring it (ccstatusline dim:parens parity).
  const dim = wc.dim === true;
  const parens = wc.dim === "parens";
  if (color === undefined && bgColor === undefined && bold === undefined && !dim && !parens) return segments;
  let out = segments.map((s) => {
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
  if (parens) out = [{ text: "(", color: "label", bgColor }, ...out, { text: ")", color: "label", bgColor }];
  return out;
}

// OSC-8 hyperlink introducer (ESC ] 8 ; ;). A complete link has two of these
// (open with a URL, close with an empty URL). An odd count means a link was
// opened but its closer got truncated away — left dangling, the link would
// "bleed" onto everything after it on the line. (Claude HUD closeOpenHyperlink parity.)
const OSC8_INTRO = "\x1b]8;;";
const OSC8_CLOSE = "\x1b]8;;\x07";
function hasOpenHyperlink(text: string): boolean {
  return (text.split(OSC8_INTRO).length - 1) % 2 === 1;
}

/** Truncate a widget's segments to `maxWidth` display columns, appending an ellipsis.
 * ccstatusline WidgetItem.maxWidth parity. Measures real terminal columns. */
function truncateSegments(segments: Segment[], maxWidth: number): Segment[] {
  if (maxWidth <= 0) return segments;
  // Measure VISIBLE columns (strip VT/OSC8) so a hyperlink's URL bytes don't
  // count toward the budget.
  let total = 0;
  for (const s of segments) total += plainLen(s.text);
  if (total <= maxWidth) return segments;
  const limit = Math.max(1, maxWidth - 1); // leave a column for the ellipsis
  const out: Segment[] = [];
  let used = 0;
  for (const s of segments) {
    const w = plainLen(s.text);
    if (used + w <= limit) { out.push(s); used += w; continue; }
    // A segment carrying escape sequences (e.g. an OSC-8 hyperlink) is atomic:
    // include it whole if it fits, else stop — never cut mid-sequence/mid-URL.
    if (s.text.includes("\x1b")) break;
    let txt = "";
    for (const ch of s.text) {
      const cw = displayWidth(ch);
      if (used + cw > limit) break;
      txt += ch; used += cw;
    }
    if (txt) out.push({ ...s, text: txt });
    break;
  }
  // If truncation cut inside an OSC-8 hyperlink, close it before the ellipsis so
  // the link can't swallow the rest of the line.
  if (hasOpenHyperlink(out.map((s) => s.text).join(""))) out.push({ text: OSC8_CLOSE });
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
    // Primary color = first non-label value segment (used by inheritSeparatorColors).
    const primary = segments.find((s) => s.color && s.color !== "label" && s.text.trim() !== "")?.color;
    built.push({ segments, merge: wc.merge === true, color: primary });
  }
  // Line gradient: recolor each widget's value segments by interpolated position
  // across the gradient stops (left → right). Labels/padding keep their styling.
  const grad = Array.isArray(line.gradient) ? line.gradient.filter((c) => typeof c === "string" && c.startsWith("#")) : [];
  if (grad.length >= 2 && built.length) {
    built.forEach((b, i) => {
      const color = gradientAt(grad, built.length === 1 ? 0 : i / (built.length - 1));
      b.segments = b.segments.map((s) => (s.color === "label" || s.text.trim() === "" ? s : { ...s, color }));
    });
  }
  return built;
}

interface InlineChunk { str: string; color?: string; flex: boolean; fill: string; fillColor?: string }

function termWidth(): number {
  return Number(process.env.CC_STATUS_DASH_WIDTH) || Number(process.env.COLUMNS) || process.stdout.columns || 80;
}

/** Effective width for width-aware inline layout (auto-wrap, flex fill). `flexMode`
 * reserves room for Claude Code's own UI chrome around the statusline (ccstatusline
 * parity): "full" trims a small margin, "full-minus-40" trims more (room for a wider
 * input box / compaction banner), "full-until-compact" switches between the two once
 * context usage crosses `compactThreshold` — so the line only shrinks once Claude
 * Code's own compaction UI is likely to appear. Unset `flexMode` keeps the raw
 * terminal width (prior behavior, unaffected by this config).
 */
function effectiveWidth(ctx: RenderContext): number {
  const base = termWidth();
  const mode = ctx.config.flexMode;
  if (mode === "full") return Math.max(1, base - 6);
  if (mode === "full-minus-40") return Math.max(1, base - 40);
  if (mode === "full-until-compact") {
    const pct = ctx.input.context_window?.used_percentage ?? 0;
    const threshold = ctx.config.compactThreshold ?? 60;
    return Math.max(1, base - (pct >= threshold ? 40 : 6));
  }
  return base;
}

function renderInline(built: BuiltWidget[], painter: Painter, sep: string, autoWrap: boolean, ctx: RenderContext, inheritSep = false): string {
  const chunks: InlineChunk[] = [];
  for (const wgt of built) {
    const flexSeg = wgt.segments.find((s) => s.flex);
    const isFlex = Boolean(flexSeg);
    const str = wgt.segments.map((s) => painter.paint(s.text, s)).join("");
    // A flex spacer is never merged into a neighbor — it must stay a standalone gap.
    if (wgt.merge && chunks.length && !isFlex) chunks[chunks.length - 1].str += str;
    else chunks.push({ str, color: wgt.color, flex: isFlex, fill: flexSeg?.text || " ", fillColor: flexSeg?.color });
  }
  // Separator before chunk i takes the previous widget's color when inheritSeparatorColors
  // is on (ccstatusline parity); otherwise the dim "label" color. Color codes are
  // zero-width, so wrap math is unaffected.
  const sepBefore = (i: number) =>
    ` ${painter.paint(sep, { color: inheritSep ? (chunks[i - 1]?.color ?? "label") : "label" })} `;

  // Flex spacers expand to fill the terminal width (right-aligning trailing widgets).
  // This owns the full line, so it takes precedence over auto-wrap.
  if (chunks.some((c) => c.flex)) return renderInlineFlex(chunks, painter, sepBefore, effectiveWidth(ctx));

  if (!autoWrap) return chunks.map((c, i) => (i === 0 ? c.str : sepBefore(i) + c.str)).join("");

  const width = effectiveWidth(ctx);
  const sepLen = plainLen(sepBefore(1));
  const lines: string[] = [];
  let cur = "", curLen = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i].str;
    const cl = plainLen(c);
    if (cur === "") { cur = c; curLen = cl; }
    else if (curLen + sepLen + cl <= width) { cur += sepBefore(i) + c; curLen += sepLen + cl; }
    else { lines.push(cur); cur = c; curLen = cl; }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

/**
 * Assemble an inline line containing one or more flex spacers. Normal separators are
 * placed only between two adjacent non-flex chunks (a flex spacer provides its own
 * gap). Remaining width is split evenly across the flex spacers; each fills its share
 * by repeating its unit glyph (the leftover columns go to the trailing spacers).
 */
function renderInlineFlex(chunks: InlineChunk[], painter: Painter, sepBefore: (i: number) => string, width: number): string {
  interface Piece { text?: string; vis: number; flex?: { fill: string; color?: string } }
  const pieces: Piece[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];
    if (i > 0 && !chunks[i - 1].flex && !cur.flex) {
      const s = sepBefore(i);
      pieces.push({ text: s, vis: plainLen(s) });
    }
    if (cur.flex) pieces.push({ vis: 0, flex: { fill: cur.fill, color: cur.fillColor } });
    else pieces.push({ text: cur.str, vis: plainLen(cur.str) });
  }
  const fixed = pieces.reduce((n, p) => n + (p.flex ? 0 : p.vis), 0);
  const nFlex = pieces.filter((p) => p.flex).length;
  const remaining = Math.max(0, width - fixed);
  const base = Math.floor(remaining / nFlex);
  const leftover = remaining - base * nFlex; // give the last `leftover` spacers +1 column
  let seen = 0;
  for (const p of pieces) {
    if (!p.flex) continue;
    seen++;
    const cols = base + (seen > nFlex - leftover ? 1 : 0);
    const unit = p.flex.fill || " ";
    const uw = Math.max(1, displayWidth(unit));
    const count = Math.floor(cols / uw);
    const fillStr = unit.repeat(count) + " ".repeat(cols - count * uw);
    p.text = fillStr ? painter.paint(fillStr, { color: p.flex.color ?? "label" }) : "";
  }
  return pieces.map((p) => p.text ?? "").join("");
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

// Powerline end caps (Nerd Font half-circle / flame). `none` keeps the flush edge.
// Defined by codepoint so the PUA glyphs survive editing: round = U+E0B6/E0B4,
// flame = U+E0C2/E0C0.
const POWERLINE_CAPS: Record<string, { left: string; right: string }> = {
  round: { left: String.fromCodePoint(0xe0b6), right: String.fromCodePoint(0xe0b4) },
  flame: { left: String.fromCodePoint(0xe0c2), right: String.fromCodePoint(0xe0c0) },
};
function renderPowerline(built: BuiltWidget[], painter: Painter, ctx: RenderContext): string {
  const bgCycle = ["model", "cwd", "git"];
  const arrow = ctx.config.charset === "text"
    ? POWERLINE_SEP_TEXT
    : (POWERLINE_SEPS[ctx.config.powerlineSeparator ?? ""] ?? POWERLINE_SEP);
  const caps = ctx.config.charset !== "text" ? POWERLINE_CAPS[ctx.config.powerlineCaps ?? ""] : undefined;
  let out = "";
  // Left cap: a glyph in the first segment's bg, on the terminal's default bg.
  if (caps && built.length) out += painter.paint(caps.left, { color: bgCycle[0] });
  built.forEach((wgt, i) => {
    const bg = bgCycle[i % bgCycle.length];
    const text = " " + wgt.segments.map((s) => s.text).join("") + " ";
    out += painter.paint(text, { bgColor: bg, color: "label", bold: true });
    const last = i + 1 >= built.length;
    if (last && caps) {
      out += painter.paint(caps.right, { color: bg }); // right cap closes the bar
    } else {
      const nextBg = !last ? bgCycle[(i + 1) % bgCycle.length] : undefined;
      out += painter.paint(arrow, { color: bg, bgColor: nextBg });
    }
  });
  return out;
}

// Panel style: frame a line's inline content in a box (Claude HUD panel look).
// Charset-aware (rounded box vs ASCII). One config line → three output rows; the
// border is painted via the painter so NO_COLOR / colorDepth are honored.
function framePanel(content: string, painter: Painter, ctx: RenderContext): string {
  const text = ctx.config.charset === "text";
  const tl = text ? "+" : "╭", tr = text ? "+" : "╮", bl = text ? "+" : "╰", br = text ? "+" : "╯";
  const hz = text ? "-" : "─", vt = text ? "|" : "│";
  const rows = content.split("\n");
  const inner = Math.max(...rows.map((r) => plainLen(r)));
  const bar = (s: string) => painter.paint(s, { color: "label" });
  const top = bar(tl + hz.repeat(inner + 2) + tr);
  const bottom = bar(bl + hz.repeat(inner + 2) + br);
  const mid = rows.map((r) => `${bar(vt)} ${r}${" ".repeat(inner - plainLen(r))} ${bar(vt)}`);
  return [top, ...mid, bottom].join("\n");
}

export function render(ctx: RenderContext): string {
  const config: Config = ctx.config;
  const painter = createPainter(config);
  const sep = config.charset === "text" && config.separator === "│" ? "|" : config.separator;
  const inherit = config.inheritSeparatorColors === true;
  const out: string[] = [];
  for (const line of config.lines) {
    const built = buildLineWidgets(line, ctx);
    if (line.showWhen === "activity" && built.length === 0) continue;
    if (built.length === 0) continue;
    out.push(
      line.style === "powerline" ? renderPowerline(built, painter, ctx)
      : line.style === "capsule" ? renderCapsule(built, painter, ctx)
      : line.style === "panel" ? framePanel(renderInline(built, painter, sep, false, ctx, inherit), painter, ctx)
      : renderInline(built, painter, sep, config.autoWrap, ctx, inherit),
    );
  }
  return out.join("\n");
}
