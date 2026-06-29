import { readFileSync, existsSync } from "node:fs";
import type { TranscriptInfo } from "../types.js";

// Transcript JSONL parser — the heart of the "HUD" features (tools/agents/todos).
// This is a deliberately simplified scaffold: it tails the file, parses recent
// lines, and extracts tool_use / subagent / TodoWrite activity. A production
// version would dedupe streaming entries (ccstatusline) and cache aggressively.

const MAX_BYTES = 256 * 1024; // only read the tail; transcripts can be huge

export function collectTranscript(path?: string): TranscriptInfo {
  const empty: TranscriptInfo = { recentTools: [], agents: [], todos: { total: 0, completed: 0 } };
  if (!path || !existsSync(path)) return empty;

  let raw: string;
  try {
    const buf = readFileSync(path);
    raw = buf.subarray(Math.max(0, buf.length - MAX_BYTES)).toString("utf8");
  } catch {
    return empty;
  }

  const lines = raw.split("\n").filter(Boolean);
  const tools: TranscriptInfo["recentTools"] = [];
  const agents: TranscriptInfo["agents"] = [];
  let todos: TranscriptInfo["todos"] = { total: 0, completed: 0 };
  let lastUserMs: number | undefined;

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // partial tail line
    }

    if (entry.type === "user" && entry.timestamp) {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) lastUserMs = t;
    }

    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block?.type === "tool_use") {
        if (block.name === "TodoWrite") {
          const items = block.input?.todos ?? [];
          const completed = items.filter((t: any) => t.status === "completed").length;
          const current = items.find((t: any) => t.status === "in_progress")?.content;
          todos = { total: items.length, completed, current };
        } else if (block.name === "Task") {
          agents.push({
            name: block.input?.subagent_type ?? "agent",
            status: "running",
          });
        } else {
          tools.push({
            name: block.name,
            target: extractTarget(block.input),
            done: true,
          });
        }
      }
    }
  }

  return {
    recentTools: tools.slice(-6).reverse(),
    agents: agents.slice(-3),
    todos,
    msSinceLastUser: lastUserMs ? Date.now() - lastUserMs : undefined,
  };
}

function extractTarget(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const i = input as Record<string, unknown>;
  const p = (i.file_path ?? i.path ?? i.pattern ?? i.command) as string | undefined;
  if (!p) return undefined;
  return p.split(/[\\/]/).pop();
}
