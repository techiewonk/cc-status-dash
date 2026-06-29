import type { Config, LineConfig, RenderContext, Segment } from "../types.js";
import { getWidget } from "../widgets/index.js";
import { stripVTControlCharacters } from "node:util";
import { createPainter, type Painter } from "./colors.js";

// Renders the resolved config into the final multi-line string.
// Line styles: inline / powerline / capsule. Global options honored:
// globalBold, padding, minimalist (in widgets), widget merge, and auto-wrap.

const POWERLINE_SEP = "";
const POWERLINE_SEP_TEXT = "";
const CAP_LEFT = "";
const CAP_RIGHT = "";

interface BuiltWidget { segments: Segment[]; merge: boolean; }

function plainLen(s: string): number {
  // Node built-in: strips ANSI/VT (incl. OSC8 hyperlinks) — replaces a hand regex.
  return stripVTControlCharacters(s).length;
}

function buildLineWidgets(line: LineConfig, ctx: RenderContext): BuiltWidget[] {
  const built: BuiltWidget[] = [];
  const pad = " ".repeat(Math.max(0, ctx.config.padding));
  for (const wc of line.widgets) {
    const widget = getWidget(wc.id);
    if (!widget) continue;
    let segments = widget.render(widget.collect(ctx), wc, ctx);
    if (segments.length === 0) continue;
    if (ctx.config.globalBold) segments = segments.map((s) => ({ ...s, bold: true }));
    if (pad) segments = [{ text: pad }, ...segments, { text: pad }];
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

  const width = process.stdout.columns || Number(process.env.COLUMNS) || 80;
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
  const arrow = ctx.config.charset === "text" ? POWERLINE_SEP_TEXT : POWERLINE_SEP;
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
      : renderInline(built, painter, config.separator, config.autoWrap),
    );
  }
  return out.join("\n");
}
