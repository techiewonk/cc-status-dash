import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { stripVTControlCharacters as strip } from "node:util";
import { writeFileSync } from "node:fs";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { render as renderLine } from "../render/renderer.js";
import { listWidgets } from "../widgets/index.js";
import { listThemes } from "../themes/index.js";
import { initialState, reduce, type Action, type EditorState } from "./reducer.js";
import { fuzzyFilter, type PickItem } from "./picker.js";
import { serializeConfig } from "../config/wizard.js";

// Ink live-preview config editor. All edits go through the pure `reduce`; this
// component is just keys-in / frame-out, so the logic stays testable headlessly
// (see __tests__/tui.test.tsx, driven by ink-testing-library).

const SAMPLE: StatuslineInput = {
  model: { display_name: "Claude Opus 4.8" },
  workspace: { current_dir: process.cwd() },
  context_window: { context_window_size: 200000, used_percentage: 46 },
  cost: { total_cost_usd: 3.42 },
  rate_limits: {
    five_hour: { used_percentage: 38, resets_at: Date.now() + 3 * 3600 * 1000 },
    seven_day: { used_percentage: 61, resets_at: Date.now() + 3 * 86400 * 1000 },
  },
};

const ALL_ITEMS: PickItem[] = listWidgets().map((wd) => ({ id: wd.id, label: wd.label, category: wd.category }));

export interface AppProps {
  initial: Config;
  savePath: string;
  onSaved?: (p: string) => void;
}

export function App({ initial, savePath, onSaved }: AppProps) {
  const { exit } = useApp();
  const [state, setState] = useState<EditorState>(() => initialState(initial));
  const [picker, setPicker] = useState({ open: false, query: "", index: 0 });
  const [status, setStatus] = useState("");
  const themes = listThemes();
  const dispatch = (a: Action) => setState((s) => reduce(s, a));
  const results = picker.open ? fuzzyFilter(picker.query, ALL_ITEMS) : [];

  useInput((input, key) => {
    if (picker.open) {
      if (key.escape) return setPicker({ open: false, query: "", index: 0 });
      if (key.return) {
        const item = results[picker.index];
        if (item) {
          dispatch({ type: "addWidget", id: item.id });
          setStatus(`added ${item.id}`);
        }
        return setPicker({ open: false, query: "", index: 0 });
      }
      if (key.upArrow) return setPicker((p) => ({ ...p, index: Math.max(0, p.index - 1) }));
      if (key.downArrow) return setPicker((p) => ({ ...p, index: Math.min(results.length - 1, p.index + 1) }));
      if (key.backspace || key.delete) return setPicker((p) => ({ ...p, query: p.query.slice(0, -1), index: 0 }));
      if (input) setPicker((p) => ({ ...p, query: p.query + input, index: 0 }));
      return;
    }
    if (input === "q" || key.escape) return exit();
    if (key.upArrow) return dispatch({ type: "up" });
    if (key.downArrow) return dispatch({ type: "down" });
    if (key.leftArrow) return dispatch({ type: "left" });
    if (key.rightArrow) return dispatch({ type: "right" });
    if (input === "a") return setPicker({ open: true, query: "", index: 0 });
    if (input === "d") return dispatch({ type: "deleteWidget" });
    if (input === "k") return dispatch({ type: "cloneWidget" });
    if (input === "[") return dispatch({ type: "moveLeft" });
    if (input === "]") return dispatch({ type: "moveRight" });
    if (input === "n") return dispatch({ type: "addLine" });
    if (input === "x") return dispatch({ type: "removeLine" });
    if (input === "s") return dispatch({ type: "cycleStyle" });
    if (input === "t") return dispatch({ type: "cycleTheme", themes });
    if (input === "w") {
      writeFileSync(savePath, serializeConfig(state.config), "utf8");
      setStatus(`saved ${savePath}`);
      onSaved?.(savePath);
    }
  });

  const ctx: RenderContext = { input: SAMPLE, data: {}, config: state.config };
  const preview = strip(renderLine(ctx)) || "(empty)";

  return (
    <Box flexDirection="column">
      <Text bold>cc-status-dash editor</Text>
      <Box borderStyle="round" flexDirection="column" paddingX={1}>
        {preview.split("\n").map((l, i) => (
          <Text key={i}>{l || " "}</Text>
        ))}
      </Box>
      <Text>
        theme: <Text color="cyan">{state.config.theme}</Text> · preset: <Text color="cyan">{state.config.preset}</Text>
      </Text>
      {state.config.lines.map((line, li) => (
        <Box key={li} flexDirection="column">
          <Text>
            {li === state.cursor.line ? "›" : " "} line {li + 1} [{line.style ?? "inline"}]
          </Text>
          <Box marginLeft={2}>
            <Text>
              {line.widgets.length === 0 ? (
                <Text dimColor>(empty)</Text>
              ) : (
                line.widgets.map((wc, wi) => {
                  const sel = li === state.cursor.line && wi === state.cursor.widget;
                  return (
                    <Text key={wi} inverse={sel} color={sel ? undefined : "gray"}>
                      {` ${wc.id} `}
                    </Text>
                  );
                })
              )}
            </Text>
          </Box>
        </Box>
      ))}
      {picker.open ? (
        <Box borderStyle="single" flexDirection="column" paddingX={1}>
          <Text>
            add widget: <Text color="yellow">{picker.query}</Text>
            <Text dimColor>▍</Text>
          </Text>
          {results.slice(0, 8).map((r, i) => (
            <Text key={r.id} inverse={i === picker.index}>
              {r.id} <Text dimColor>{r.category}</Text>
            </Text>
          ))}
          {results.length === 0 ? <Text dimColor>no matches</Text> : null}
        </Box>
      ) : (
        <Text dimColor>↑↓←→ move · a add · d del · k clone · [ ] reorder · n/x line · s style · t theme · w save · q quit</Text>
      )}
      {status ? <Text color="green">{status}</Text> : null}
    </Box>
  );
}
