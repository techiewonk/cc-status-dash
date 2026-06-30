import type { Config, ProviderData, StatuslineInput, DataSource } from "../types.js";
import { getWidget } from "../widgets/index.js";
import { collectGit } from "./git.js";
import { collectTranscript } from "./transcript.js";
import { collectSystem } from "./system.js";
import { collectStats } from "./stats.js";

// Run only the providers the active config needs.
function neededSources(config: Config): Set<DataSource> {
  const needed = new Set<DataSource>();
  for (const line of config.lines)
    for (const wc of line.widgets) getWidget(wc.id)?.needs.forEach((n) => needed.add(n));
  return needed;
}

export function collectProviderData(input: StatuslineInput, config: Config): ProviderData {
  const needed = neededSources(config);
  const data: ProviderData = {};
  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();
  // Isolate each provider: a throw in one data source must not wipe the whole
  // statusline (it just leaves that source undefined; widgets already null-check).
  const wantGitFiles = config.lines.some((l) => l.widgets.some((wc) => wc.id === "git.files"));
  try { if (needed.has("git")) data.git = collectGit(cwd, { files: wantGitFiles }); } catch { /* ignore */ }
  try { if (needed.has("transcript")) data.transcript = collectTranscript(input.transcript_path); } catch { /* ignore */ }
  try { if (needed.has("system")) data.system = collectSystem(cwd, input.session_id); } catch { /* ignore */ }
  try { if (needed.has("stats")) data.stats = collectStats(input); } catch { /* ignore */ }
  return data;
}
