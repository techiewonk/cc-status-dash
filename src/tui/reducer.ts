import type { Config, LineStyle } from "../types.js";
import {
  addLine,
  addWidget,
  applyPreset,
  cloneWidget,
  moveWidget,
  removeLine,
  removeWidget,
  setLineStyle,
  setTheme,
} from "../config/mutations.js";

// Pure editor state machine for the Ink TUI. Keeping all edits here (driven by
// the tested mutations engine) means the Ink view is a thin render layer and the
// behavior is fully unit-testable without a terminal.

export interface Cursor {
  line: number;
  widget: number;
}
export interface EditorState {
  config: Config;
  cursor: Cursor;
}

export type Action =
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "addWidget"; id: string }
  | { type: "deleteWidget" }
  | { type: "cloneWidget" }
  | { type: "moveLeft" }
  | { type: "moveRight" }
  | { type: "addLine" }
  | { type: "removeLine" }
  | { type: "cycleStyle" }
  | { type: "cycleTheme"; themes: string[] }
  | { type: "setPreset"; id: string };

const STYLES: LineStyle[] = ["inline", "powerline", "capsule"];

function clampCursor(config: Config, c: Cursor): Cursor {
  const line = Math.max(0, Math.min(c.line, config.lines.length - 1));
  const count = config.lines[line]?.widgets.length ?? 0;
  const widget = Math.max(0, Math.min(c.widget, Math.max(0, count - 1)));
  return { line, widget };
}

export function initialState(config: Config): EditorState {
  return { config, cursor: { line: 0, widget: 0 } };
}

export function reduce(state: EditorState, action: Action): EditorState {
  const { config, cursor } = state;
  const line = config.lines[cursor.line];
  switch (action.type) {
    case "up":
      return { config, cursor: clampCursor(config, { ...cursor, line: cursor.line - 1 }) };
    case "down":
      return { config, cursor: clampCursor(config, { ...cursor, line: cursor.line + 1 }) };
    case "left":
      return { config, cursor: clampCursor(config, { ...cursor, widget: cursor.widget - 1 }) };
    case "right":
      return { config, cursor: clampCursor(config, { ...cursor, widget: cursor.widget + 1 }) };
    case "addWidget": {
      const next = addWidget(config, cursor.line, action.id, cursor.widget + 1);
      return { config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget + 1 }) };
    }
    case "deleteWidget": {
      const next = removeWidget(config, cursor.line, cursor.widget);
      return { config: next, cursor: clampCursor(next, cursor) };
    }
    case "cloneWidget": {
      const next = cloneWidget(config, cursor.line, cursor.widget);
      return { config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget + 1 }) };
    }
    case "moveLeft": {
      const next = moveWidget(config, cursor.line, cursor.widget, cursor.widget - 1);
      return { config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget - 1 }) };
    }
    case "moveRight": {
      const next = moveWidget(config, cursor.line, cursor.widget, cursor.widget + 1);
      return { config: next, cursor: clampCursor(next, { ...cursor, widget: cursor.widget + 1 }) };
    }
    case "addLine": {
      const next = addLine(config, "inline");
      return { config: next, cursor: clampCursor(next, { line: next.lines.length - 1, widget: 0 }) };
    }
    case "removeLine": {
      const next = removeLine(config, cursor.line);
      return { config: next, cursor: clampCursor(next, cursor) };
    }
    case "cycleStyle": {
      if (!line) return state;
      const cur = line.style ?? "inline";
      const nextStyle = STYLES[(STYLES.indexOf(cur) + 1) % STYLES.length];
      const next = setLineStyle(config, cursor.line, nextStyle);
      return { config: next, cursor };
    }
    case "cycleTheme": {
      if (action.themes.length === 0) return state;
      const i = action.themes.indexOf(config.theme);
      const nextTheme = action.themes[(i + 1) % action.themes.length];
      return { config: setTheme(config, nextTheme), cursor };
    }
    case "setPreset": {
      const next = applyPreset(config, action.id);
      return { config: next, cursor: clampCursor(next, { line: 0, widget: 0 }) };
    }
    default:
      return state;
  }
}
