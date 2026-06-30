import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectTranscript } from "../data/transcript.js";

// Verifies tool tallies + in-flight detection (Claude HUD `⊙ Bash ×12`) from a
// synthetic JSONL transcript.

function entry(type: string, content: unknown[]) {
  return JSON.stringify({ type, message: { content } });
}
const toolUse = (id: string, name: string, input: unknown = {}) => ({ type: "tool_use", id, name, input });
const toolResult = (id: string) => ({ type: "tool_result", tool_use_id: id });
// Full-entry shorthands for the edge-case tests below.
const tu = (id: string, name: string, input: unknown = {}) => ({ type: "assistant", message: { content: [toolUse(id, name, input)] } });
const tr = (id: string) => ({ type: "user", message: { content: [toolResult(id)] } });

test("toolCounts aggregates per tool and flags the in-flight one", () => {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-tx-"));
  const path = join(dir, "t.jsonl");
  try {
    const lines = [
      entry("assistant", [toolUse("1", "Bash", { command: "ls" })]),
      entry("user", [toolResult("1")]),
      entry("assistant", [toolUse("2", "Bash")]),
      entry("user", [toolResult("2")]),
      entry("assistant", [toolUse("3", "Edit", { file_path: "a.ts" })]),
      entry("user", [toolResult("3")]),
      entry("assistant", [toolUse("4", "Read")]),
      entry("user", [toolResult("4")]),
      entry("assistant", [toolUse("5", "Bash")]), // no matching tool_result -> running
    ];
    writeFileSync(path, lines.join("\n"), "utf8");

    const tc = collectTranscript(path).toolCounts;
    const byName = Object.fromEntries(tc.map((t) => [t.name, t]));
    assert.equal(byName.Bash.count, 3, "Bash used 3×");
    assert.equal(byName.Edit.count, 1);
    assert.equal(byName.Read.count, 1);
    assert.equal(byName.Bash.running, true, "Bash is the in-flight tool");
    assert.equal(byName.Edit.running, false);
    assert.equal(tc[0].name, "Bash", "running tool sorts first");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("toolCounts is empty for a missing transcript", () => {
  assert.deepEqual(collectTranscript(undefined).toolCounts, []);
});

function parse(lines: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-tx-"));
  const path = join(dir, "t.jsonl");
  writeFileSync(path, lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n"), "utf8");
  try {
    return collectTranscript(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("running tool that is NOT the last tool is still flagged (per-id, not 'last')", () => {
  const tc = parse([
    tu("1", "Edit", { file_path: "a.ts" }), // never resolved -> running, but not last
    tu("2", "Bash"), tr("2"),
    tu("3", "Read"), tr("3"),
  ]).toolCounts;
  const by = Object.fromEntries(tc.map((t) => [t.name, t]));
  assert.equal(by.Edit.running, true, "Edit is the unresolved one");
  assert.equal(by.Bash.running, false);
  assert.equal(by.Read.running, false);
  assert.equal(tc[0].name, "Edit", "running sorts first even though it ran earliest");
});

test("multiple simultaneous running tools both flagged, most-recent first", () => {
  const tc = parse([tu("1", "Bash"), tu("2", "Edit")]).toolCounts; // neither resolved
  const by = Object.fromEntries(tc.map((t) => [t.name, t]));
  assert.equal(by.Bash.running, true);
  assert.equal(by.Edit.running, true);
  assert.equal(tc[0].name, "Edit", "more-recent running tool sorts first");
});

test("orphan tool_result and a truncated first line don't crash or false-flag", () => {
  const t = parse([
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":', // truncated partial JSON
    tr("orphan"), // tool_result whose tool_use scrolled out of the tail
    tu("1", "Bash"), tr("1"),
    tu("2", "Edit"), // running
  ]);
  const by = Object.fromEntries(t.toolCounts.map((x) => [x.name, x]));
  assert.equal(by.Bash.running, false, "completed Bash not falsely running");
  assert.equal(by.Edit.running, true);
  assert.ok(!("orphan" in by), "orphan result added no phantom tool");
});

test("agent elapsedSec is computed from Task tool_use → tool_result timestamps", () => {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-tx-"));
  const path = join(dir, "t.jsonl");
  const t0 = "2026-06-30T12:00:00.000Z";
  const t1 = "2026-06-30T12:02:30.000Z"; // +150s
  writeFileSync(path, [
    JSON.stringify({ type: "assistant", timestamp: t0, message: { content: [{ type: "tool_use", id: "g1", name: "Task", input: { subagent_type: "explore" } }] } }),
    JSON.stringify({ type: "user", timestamp: t1, message: { content: [{ type: "tool_result", tool_use_id: "g1" }] } }),
  ].join("\n"), "utf8");
  try {
    const a = collectTranscript(path).agents.find((x) => x.name === "explore");
    assert.equal(a?.status, "done");
    assert.equal(a?.elapsedSec, 150);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Task model + description are captured on the agent entry", () => {
  const a = parse([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "g1", name: "Task", input: { subagent_type: "explore", model: "haiku", description: "trace the auth flow" } }] } },
  ]).agents.find((x) => x.name === "explore");
  assert.equal(a?.model, "haiku");
  assert.equal(a?.description, "trace the auth flow");
});

test("advisorModel (latest assistant stamp) + sessionStart (first timestamp) are parsed", () => {
  const t = parse([
    { type: "user", timestamp: "2026-06-30T10:00:00.000Z", message: { content: "hi" } },
    { type: "assistant", timestamp: "2026-06-30T10:00:05.000Z", advisorModel: "claude-sonnet-4-6", message: { content: [] } },
    { type: "assistant", timestamp: "2026-06-30T10:01:00.000Z", advisorModel: "claude-opus-4-7", message: { content: [] } },
  ]);
  assert.equal(t.advisorModel, "claude-opus-4-7", "keeps the latest advisor stamp");
  assert.equal(t.sessionStart, Date.parse("2026-06-30T10:00:00.000Z"), "sessionStart is the first timestamp");
});

test("block-cache: repeat read is consistent and a file change invalidates it", () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "ccsd-txcache-"));
  const prev = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = cacheDir;
  const dir = mkdtempSync(join(tmpdir(), "ccsd-tx-"));
  const path = join(dir, "t.jsonl");
  try {
    writeFileSync(path, [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Bash" }] } }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "1" }] } }),
    ].join("\n"), "utf8");
    const first = collectTranscript(path);
    const second = collectTranscript(path); // served from cache (same size+mtime)
    assert.deepEqual(second.toolCounts, first.toolCounts, "cache hit returns the same tallies");
    // grow the file -> size changes -> cache invalidated -> Edit appears
    writeFileSync(path, [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Bash" }] } }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "1" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "2", name: "Edit", input: { file_path: "a.ts" } }] } }),
    ].join("\n"), "utf8");
    const third = collectTranscript(path);
    assert.ok(third.toolCounts.some((t) => t.name === "Edit"), "file change invalidates the cache");
  } finally {
    if (prev === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("session token tallies dedupe duplicate API-response writes by id", () => {
  const usage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 200 };
  const t = parse([
    { type: "assistant", message: { id: "msg_1", usage, content: [] } },
    { type: "assistant", message: { id: "msg_1", usage, content: [] } }, // duplicate write — must not double count
    { type: "assistant", message: { id: "msg_2", usage, content: [] } },
  ]);
  assert.equal(t.sessionTokens?.input, 200, "two distinct messages -> 2x input (not 3x)");
  assert.equal(t.sessionTokens?.cacheRead, 400, "cacheRead deduped too");
});

test("agents resolve to done when their Task tool_result arrives", () => {
  const a = parse([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "g1", name: "Task", input: { subagent_type: "explore" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "g2", name: "Task", input: { subagent_type: "plan" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "g1" }] } }, // explore done
  ]).agents;
  const by = Object.fromEntries(a.map((x) => [x.name, x.status]));
  assert.equal(by.explore, "done", "resolved agent is done");
  assert.equal(by.plan, "running", "unresolved agent still running");
});
