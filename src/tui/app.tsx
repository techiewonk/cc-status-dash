import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { stripVTControlCharacters as strip } from "node:util";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { render as renderLine } from "../render/renderer.js";
import { listWidgets } from "../widgets/index.js";
import { listThemes } from "../themes/index.js";
import { PRESET_CATALOG } from "../config/defaults.js";
import { initialState, reduce, fieldsFor, fieldValue, type Action, type EditorState } from "./reducer.js";
import { displayValue, swatchColor } from "./optionSpec.js";
import { fuzzyFilter, type PickItem } from "./picker.js";
import { writeConfig } from "../config/wizard.js";
import { installStatusline, settingsPath, detectCommand } from "../config/install.js";

// Ink live-preview config editor. All edits go through the pure `reduce`; this
// component is just keys-in / frame-out, so the logic stays testable headlessly
// (see __tests__/tui.test.tsx, driven by ink-testing-library). Multi-screen:
// layout (lines/widgets) · options (per-widget) · global · colors.

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
  const [install, setInstall] = useState({ open: false, hooks: false });
  const [status, setStatus] = useState("");
  const themes = listThemes();
  const dispatch = (a: Action) => setState((s) => reduce(s, a));
  const results = picker.open ? fuzzyFilter(picker.query, ALL_ITEMS) : [];

  const save = () => {
    const res = writeConfig(savePath, state.config);
    setStatus(res.ok ? `saved ${savePath}` : `save failed: ${res.error}`);
    if (res.ok) onSaved?.(savePath);
  };

  useInput((input, key) => {
    // ---- install-to-settings.json overlay ----
    if (install.open) {
      if (key.escape) return setInstall((s) => ({ ...s, open: false }));
      if (input === "h") return setInstall((s) => ({ ...s, hooks: !s.hooks }));
      if (key.return) {
        const res = installStatusline({
          command: detectCommand(),
          refreshInterval: state.config.refreshInterval,
          padding: state.config.padding,
          installHooks: install.hooks,
        });
        setStatus(
          res.ok
            ? `installed${install.hooks ? " + hooks" : ""} → ${res.path}${res.backedUp ? " (.bak saved)" : ""} — restart Claude Code`
            : `install failed: ${res.error}`,
        );
        return setInstall((s) => ({ ...s, open: false }));
      }
      return;
    }

    // ---- add-widget fuzzy picker (layout screen) ----
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
      if (key.upArrow) return setPicker((p) => ({ ...p, index: results.length ? (p.index - 1 + results.length) % results.length : 0 }));
      if (key.downArrow) return setPicker((p) => ({ ...p, index: results.length ? (p.index + 1) % results.length : 0 }));
      if (key.backspace || key.delete) return setPicker((p) => ({ ...p, query: p.query.slice(0, -1), index: 0 }));
      if (input) setPicker((p) => ({ ...p, query: p.query + input, index: 0 }));
      return;
    }

    // Ctrl+S saves from any screen.
    if (key.ctrl && input === "s") return save();

    // ---- option / global / color editing screens ----
    if (state.screen !== "layout") {
      if (key.escape) return dispatch({ type: "back" });
      if (key.upArrow) return dispatch({ type: "fieldUp" });
      if (key.downArrow) return dispatch({ type: "fieldDown" });
      if (key.leftArrow) return dispatch({ type: "fieldAdjust", dir: -1 });
      if (key.rightArrow) return dispatch({ type: "fieldAdjust", dir: 1 });
      if (key.backspace || key.delete) return dispatch({ type: "fieldBackspace" });
      if (input) dispatch({ type: "fieldType", input });
      return;
    }

    // ---- layout screen ----
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
    if (input === "o") return dispatch({ type: "openScreen", screen: "options" });
    if (input === "g") return dispatch({ type: "openScreen", screen: "global" });
    if (input === "c") return dispatch({ type: "openScreen", screen: "colors" });
    if (input === "i") return setInstall((s) => ({ ...s, open: true }));
    if (input === "p") {
      const ids = PRESET_CATALOG.map((pp) => pp.id);
      const next = ids[(ids.indexOf(state.config.preset) + 1) % ids.length];
      dispatch({ type: "setPreset", id: next });
      setStatus(`preset ${next}`);
      return;
    }
    if (input === "w") return save();
  });

  const ctx: RenderContext = { input: SAMPLE, data: {}, config: state.config };
  const preview = strip(renderLine(ctx)) || "(empty)";

  // ---- editor screens (options / global / colors) ----
  if (state.screen !== "layout") {
    const fields = fieldsFor(state);
    const selWidget = state.config.lines[state.cursor.line]?.widgets[state.cursor.widget];
    const title =
      state.screen === "options"
        ? `options · ${selWidget?.id ?? "(no widget)"}`
        : state.screen === "global"
          ? "global settings"
          : "colors (override theme)";
    return (
      <Box flexDirection="column">
        <Text bold>cc-status-dash · {title}</Text>
        <Box borderStyle="round" flexDirection="column" paddingX={1}>
          {preview.split("\n").map((l, i) => (
            <Text key={i}>{l || " "}</Text>
          ))}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {fields.length === 0 ? (
            <Text dimColor>no editable options for this widget</Text>
          ) : (
            fields.map((spec, i) => {
              const sel = i === state.field;
              const raw = fieldValue(state, spec);
              const val = displayValue(raw, spec);
              const sw = spec.kind === "color" ? swatchColor(raw) : null;
              const typing = spec.kind === "text" || spec.kind === "number" || spec.kind === "color";
              return (
                <Box key={spec.key}>
                  <Text color={sel ? "green" : undefined}>{sel ? "▶ " : "  "}</Text>
                  <Text color={sel ? "green" : undefined}>{spec.label}: </Text>
                  <Text color={sel ? "cyan" : "gray"}>
                    {val}
                    {sel && typing ? <Text dimColor>▍</Text> : null}
                  </Text>
                  {sw ? <Text color={sw}> ██</Text> : null}
                </Box>
              );
            })
          )}
        </Box>
        <Text dimColor>
          ↑↓ field · ←→ {fields[state.field]?.kind === "color" ? "cycle palette" : "change"}{" "}
          {(() => {
            const k = fields[state.field]?.kind;
            return k === "text" || k === "number" || k === "color" ? "· type to edit · ⌫ delete " : "";
          })()}
          · Ctrl+S save · ESC back
        </Text>
        {status ? <Text color="green">{status}</Text> : null}
      </Box>
    );
  }

  // ---- layout screen ----
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
      {install.open ? (
        <Box borderStyle="single" flexDirection="column" paddingX={1}>
          <Text bold>install into Claude Code settings.json</Text>
          <Text>
            target: <Text color="cyan">{settingsPath()}</Text>
          </Text>
          <Text>
            command: <Text color="cyan">{detectCommand()}</Text>
          </Text>
          <Text>
            skills hooks: <Text color={install.hooks ? "green" : "gray"}>{install.hooks ? "on" : "off"}</Text>{" "}
            <Text dimColor>(records /slash + Skill invocations)</Text>
          </Text>
          <Text dimColor>h toggle hooks · Enter write (backs up .bak) · Esc cancel</Text>
        </Box>
      ) : picker.open ? (
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
        <Box flexDirection="column">
          <Text dimColor>↑↓←→ move · a add · d del · k clone · [ ] reorder · n/x line · s style</Text>
          <Text dimColor>o options · g global · c colors · t theme · p preset · i install · w save · q quit</Text>
        </Box>
      )}
      {status ? <Text color="green">{status}</Text> : null}
    </Box>
  );
}
