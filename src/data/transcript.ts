import { readFileSync, existsSync } from "node:fs";
import type { TranscriptInfo } from "../types.js";

// Transcript JSONL parser — powers the HUD features (tools/agents/todos) plus
// skills, MCP servers, session token usage, and compaction count (parity with
// Claude HUD's transcript reader). Simplified scaffold: tails the file.

const MAX_BYTES = 512 * 1024;

export function collectTranscript(path?: string): TranscriptInfo {
  const empty: TranscriptInfo = {
    recentTools: [], agents: [], todos: { total: 0, completed: 0 }, skills: [], mcpServers: [],
  };
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
  const skills = new Set<string>();
  const mcpServers = new Set<string>();
  let todos: TranscriptInfo["todos"] = { total: 0, completed: 0 };
  let sessionTokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
  let compactionCount = 0;
  let sessionName: string | undefined;
  let lastUserMs: number | undefined;
  let lastAssistantMs: number | undefined;

  for (const line of lines) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type === "user" && entry.timestamp) {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) lastUserMs = t;
    }
    if (entry.type === "assistant" && entry.timestamp) {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) lastAssistantMs = t;
    }
    if (entry.type === "compact_boundary" || entry.subtype === "compact_boundary") compactionCount++;
    if (entry.sessionName) sessionName = entry.sessionName;

    const usage = entry?.message?.usage;
    if (usage) {
      sessionTokens.input += usage.input_tokens ?? 0;
      sessionTokens.output += usage.output_tokens ?? 0;
      sessionTokens.cacheCreation += usage.cache_creation_input_tokens ?? 0;
      sessionTokens.cacheRead += usage.cache_read_input_tokens ?? 0;
    }

    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== "tool_use") continue;
      const name: string = block.name ?? "";
      if (name === "TodoWrite") {
        const items = block.input?.todos ?? [];
        todos = {
          total: items.length,
          completed: items.filter((t: any) => t.status === "completed").length,
          current: items.find((t: any) => t.status === "in_progress")?.content,
        };
      } else if (name === "Task") {
        agents.push({ name: block.input?.subagent_type ?? "agent", status: "running" });
      } else if (name === "Skill" || name.startsWith("Skill")) {
        if (block.input?.command) skills.add(String(block.input.command));
      } else if (name.startsWith("mcp__")) {
        mcpServers.add(name.split("__")[1] ?? name);
        tools.push({ name, target: undefined, done: true });
      } else {
        tools.push({ name, target: extractTarget(block.input), done: true });
      }
    }
  }

  return {
    recentTools: tools.slice(-6).reverse(),
    agents: agents.slice(-3),
    todos,
    skills: [...skills],
    mcpServers: [...mcpServers],
    sessionName,
    sessionTokens,
    compactionCount,
    msSinceLastUser: lastUserMs ? Date.now() - lastUserMs : undefined,
    lastResponseMs: (lastAssistantMs && lastUserMs && lastAssistantMs > lastUserMs) ? lastAssistantMs - lastUserMs : undefined,
  };
}

function extractTarget(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const i = input as Record<string, unknown>;
  const p = (i.file_path ?? i.path ?? i.pattern ?? i.command) as string | undefined;
  return p ? p.split(/[\\/]/).pop() : undefined;
}
