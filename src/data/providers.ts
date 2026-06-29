import type { Config, ProviderData, StatuslineInput, DataSource } from "../types.js";
import { getWidget } from "../widgets/index.js";
import { collectGit } from "./git.js";
import { collectTranscript } from "./transcript.js";

// Figure out which data sources the active config actually needs, then run
// only those providers. Keeps the render path cheap when, e.g., no widget
// needs git or the transcript.

function neededSources(config: Config): Set<DataSource> {
  const needed = new Set<DataSource>();
  for (const line of config.lines) {
    for (const wc of line.widgets) {
      const w = getWidget(wc.id);
      w?.needs.forEach((n) => needed.add(n));
    }
  }
  return needed;
}

export function collectProviderData(input: StatuslineInput, config: Config): ProviderData {
  const needed = neededSources(config);
  const data: ProviderData = {};
  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();

  if (needed.has("git")) data.git = collectGit(cwd);
  if (needed.has("transcript")) data.transcript = collectTranscript(input.transcript_path);
  // "system" provider (mem/tmux) intentionally omitted from the scaffold.
  return data;
}
