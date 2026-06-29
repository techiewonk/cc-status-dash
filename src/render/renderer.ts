import type { Config, LineConfig, RenderContext, Segment } from "../types.js";
import { getWidget } from "../widgets/index.js";
import { createPainter, type Painter } from "./colors.js";

// Turns the resolved config + render context into the final multi-line string.
// Two line styles for now: "inline" (HUD-clean separators) and "powerline"
// (filled segments with arrow transitions). Empty widgets are auto-culled.

const POWERLINE_SEP = ""; // U+E0B0
const POWERLINE_SEP_TEXT = "";

interface BuiltWidget {
  segments: Segment[];
}

function buildLineWidgets(line: LineConfig, ctx: RenderContext): BuiltWidget[] {
  const built: BuiltWidget[] = [];
  for (const wc of line.widgets) {
    const widget = getWidget(wc.id);
    if (!widget) continue;
    const data = widget.collect(ctx);
    const segments = widget.render(data, wc, ctx);
    if (segments.length > 0) built.push({ segments });
  }
  return built;
}

function renderInline(built: BuiltWidget[], painter: Painter, sep: string): string {
  const chunks = built.map((w) =>
    w.segments.map((s) => painter.paint(s.text, s)).join(""),
  );
  const joiner = ` ${painter.paint(sep, { color: "label" })} `;
  return chunks.join(joiner);
}

function renderPowerline(built: BuiltWidget[], painter: Painter, ctx: RenderContext): string {
  // Each widget becomes one filled block; we color the arrow as prev-fg on next-bg.
  // For a clean default we cycle through a few segment background keys.
  const bgCycle = ["model", "cwd", "git"];
  const arrow = ctx.config.charset === "text" ? POWERLINE_SEP_TEXT : POWERLINE_SEP;
  let out = "";
  built.forEach((w, i) => {
    const bg = bgCycle[i % bgCycle.length];
    const text = " " + w.segments.map((s) => s.text).join("") + " ";
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
    // "activity" lines disappear entirely when nothing is active.
    if (line.showWhen === "activity" && built.length === 0) continue;
    if (built.length === 0) continue;
    out.push(
      line.style === "powerline"
        ? renderPowerline(built, painter, ctx)
        : renderInline(built, painter, config.separator),
    );
  }
  return out.join("\n");
}
