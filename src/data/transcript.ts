import { readFileSync, existsSync } from "node:fs";
import type { TranscriptInfo } from "../types.js";
import { clean as san } from "./sanitize.js";

// Transcript JSONL parser — powers the HUD features (tools/agents/todos) plus
// skills, MCP servers, session token usage, and compaction count (parity with
// Claude HUD's transcript reader). Simplified scaffold: tails the file.

const MAX_BYTES = 512 * 1024;

export function collectTranscript(path?: string): TranscriptInfo {
  const empty: TranscriptInfo = {
    recentTools: [], toolCounts: [], agents: [], todos: { total: 0, completed: 0 }, skills: [], mcpServers: [],
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
  const agents: { name: string; id?: string }[] = [];
  // Per-tool tallies + in-flight detection: a tool_use whose id never gets a
  // matching tool_result is still running (the live tool, like Claude HUD's ⊙).
  const counts = new Map<string, { count: number; lastIdx: number }>();
  const toolUseName = new Map<string, string>();
  const pending = new Set<string>();
  let toolIdx = 0;
  const countTool = (n: string, id?: string) => {
    toolIdx++;
    const e = counts.get(n) ?? { count: 0, lastIdx: 0 };
    e.count++;
    e.lastIdx = toolIdx;
    counts.set(n, e);
    if (id) { pending.add(id); toolUseName.set(id, n); }
  };
  const skills = new Set<string>();
  const mcpServers = new Set<string>();
  let todos: TranscriptInfo["todos"] = { total: 0, completed: 0 };
  let sessionTokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
  let compactionCount = 0;
  let sessionName: string | undefined;
  let lastUserMs: number | undefined;
  let lastAssistantMs: number | undefined;
  const taskStart = new Map<string, number>(); // Task tool_use id -> start ms (for agent elapsed)
  const taskEnd = new Map<string, number>();

  for (const line of lines) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    // Subagent (Task) turns are interleaved with isSidechain:true — skip them so
    // their tools/tokens/todos don't double-count against the main session.
    if (entry?.isSidechain === true) continue;
    const entryTs = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : undefined;

    if (entry.type === "user" && entry.timestamp) {
      // Tool results are also delivered as type:"user" entries — only count a
      // real human prompt (string content, or content that isn't purely tool_result).
      const c = entry?.message?.content;
      const toolResultOnly = Array.isArray(c) && c.length > 0 && c.every((b: any) => b?.type === "tool_result");
      const t = Date.parse(entry.timestamp);
      if (!toolResultOnly && !Number.isNaN(t)) lastUserMs = t;
    }
    if (entry.type === "assistant" && entry.timestamp) {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) lastAssistantMs = t;
    }
    if (entry.type === "compact_boundary" || entry.subtype === "compact_boundary") compactionCount++;
    if (typeof entry.sessionName === "string") sessionName = san(entry.sessionName);

    const usage = entry?.message?.usage;
    if (usage) {
      sessionTokens.input += Number(usage.input_tokens) || 0;
      sessionTokens.output += Number(usage.output_tokens) || 0;
      sessionTokens.cacheCreation += Number(usage.cache_creation_input_tokens) || 0;
      sessionTokens.cacheRead += Number(usage.cache_read_input_tokens) || 0;
    }

    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_result") {
        if (block.tool_use_id) {
          pending.delete(block.tool_use_id); // result arrived → no longer running
          if (entryTs && taskStart.has(block.tool_use_id)) taskEnd.set(block.tool_use_id, entryTs);
        }
        continue;
      }
      if (block?.type !== "tool_use") continue;
      const name: string = block.name ?? "";
      if (name === "TodoWrite") {
        const items = Array.isArray(block.input?.todos) ? block.input.todos : [];
        todos = {
          total: items.length,
          completed: items.filter((t: any) => t?.status === "completed").length,
          current: san(items.find((t: any) => t?.status === "in_progress")?.content),
        };
      } else if (name === "Task") {
        agents.push({ name: san(block.input?.subagent_type) ?? "agent", id: block.id });
        if (block.id) {
          pending.add(block.id); // resolved when its tool_result arrives
          if (entryTs) taskStart.set(block.id, entryTs);
        }
      } else if (name === "Skill" || name.startsWith("Skill")) {
        if (block.input?.command) skills.add(san(String(block.input.command)));
      } else if (name.startsWith("mcp__")) {
        mcpServers.add(san(name.split("__")[1] ?? name));
        tools.push({ name: san(name), target: undefined, done: true });
        countTool(san(name), block.id);
      } else {
        tools.push({ name: san(name), target: san(extractTarget(block.input)), done: true });
        countTool(san(name), block.id);
      }
    }
  }

  const runningNames = new Set<string>();
  for (const id of pending) {
    const n = toolUseName.get(id);
    if (n) runningNames.add(n);
  }
  const toolCounts = [...counts.entries()]
    .map(([name, e]) => ({ name, count: e.count, running: runningNames.has(name), lastIdx: e.lastIdx }))
    .sort((a, b) => Number(b.running) - Number(a.running) || b.lastIdx - a.lastIdx) // running first, then most-recent
    .map(({ name, count, running }) => ({ name, count, running }));

  return {
    recentTools: tools.slice(-6).reverse(),
    toolCounts,
    agents: agents.slice(-3).map((a) => {
      const start = a.id ? taskStart.get(a.id) : undefined;
      const end = a.id ? taskEnd.get(a.id) ?? Date.now() : undefined;
      const elapsedSec = start != null && end != null ? Math.max(0, Math.round((end - start) / 1000)) : undefined;
      return { name: a.name, status: a.id && pending.has(a.id) ? "running" : "done", elapsedSec };
    }),
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
