import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  handleSkillHook,
  readSkillsCache,
  mergeSkills,
  skillFromHook,
  skillsFilePath,
} from "../data/skills-cache.js";

// Isolate the cache under a throwaway XDG_CACHE_HOME so we never touch the real one.
function withCache(fn: () => void) {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-skills-"));
  const prev = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = dir;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("skillFromHook reads the Skill tool_use and the /slash prompt forms", () => {
  assert.equal(
    skillFromHook({ hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill: "code-review" } }),
    "code-review",
  );
  assert.equal(
    skillFromHook({ hook_event_name: "UserPromptSubmit", prompt: "/deep-research find X" }),
    "deep-research",
  );
  assert.equal(skillFromHook({ hook_event_name: "UserPromptSubmit", prompt: "just a message" }), "");
  assert.equal(skillFromHook({ hook_event_name: "PreToolUse", tool_name: "Bash" }), "");
});

test("handleSkillHook appends invocations that readSkillsCache reads back in order", () => {
  withCache(() => {
    const sid = "sess-1";
    handleSkillHook(JSON.stringify({ session_id: sid, hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill: "verify" } }));
    handleSkillHook(JSON.stringify({ session_id: sid, hook_event_name: "UserPromptSubmit", prompt: "/simplify" }));
    assert.deepEqual(readSkillsCache(sid), ["verify", "simplify"]);
    // one JSONL line per invocation
    const lines = readFileSync(skillsFilePath(sid), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
  });
});

test("handleSkillHook ignores payloads with no session id or no skill", () => {
  withCache(() => {
    handleSkillHook(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill: "x" } })); // no session
    handleSkillHook(JSON.stringify({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "hi" })); // no skill
    handleSkillHook("not json");
    handleSkillHook(null);
    assert.deepEqual(readSkillsCache("s"), []);
  });
});

test("skill names are control-char sanitized before caching", () => {
  withCache(() => {
    handleSkillHook(JSON.stringify({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill: "ev[31mil" } }));
    assert.deepEqual(readSkillsCache("s"), ["ev[31mil"]);
  });
});

test("a traversal-y session id can't escape the cache dir", () => {
  const p = skillsFilePath("../../etc/passwd");
  assert.ok(!p.includes(".."), `sanitized path must not contain '..': ${p}`);
  assert.ok(/[\\/]skills-_+etc_passwd\.jsonl$/.test(p), p);
});

test("mergeSkills dedupes keeping most-recent-last and orders oldest→newest", () => {
  withCache(() => {
    const sid = "s-merge";
    // cache: a used, then c, then a again (most recent)
    for (const skill of ["a", "c", "a"]) {
      handleSkillHook(JSON.stringify({ session_id: sid, hook_event_name: "PreToolUse", tool_name: "Skill", tool_input: { skill } }));
    }
    // transcript saw a and b
    const merged = mergeSkills(["a", "b"], sid);
    // unique; 'a' collapses to its latest (cache) position => trails the list
    assert.deepEqual(merged, ["b", "c", "a"]);
    assert.equal(merged[merged.length - 1], "a"); // widget "last" mode => most recent
  });
});

test("mergeSkills returns the transcript list unchanged when no hook cache exists", () => {
  withCache(() => {
    assert.deepEqual(mergeSkills(["x", "y"], "no-such-session"), ["x", "y"]);
    assert.deepEqual(mergeSkills(["x"], undefined), ["x"]);
  });
});
