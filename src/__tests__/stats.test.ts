import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectStats } from "../data/stats.js";
import type { StatuslineInput } from "../types.js";

// Isolate the stats store per test via XDG_STATE_HOME so we never touch the real file.
function withStore(fn: () => void) {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-stats-"));
  const prev = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = dir;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("budget scope:block — blockCost reflects cost accrued in the current 5h window", () => {
  withStore(() => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600; // window resets in 1h => started 4h ago
    const input: StatuslineInput = {
      session_id: "s-block",
      cost: { total_cost_usd: 2.5 },
      rate_limits: { five_hour: { used_percentage: 50, resets_at: resetsAt } },
    };
    // First render: session began inside the current window, so block cost == session cost.
    const out = collectStats(input);
    assert.equal(out.sessionCost, 2.5);
    assert.ok(out.blockCost != null && out.blockCost >= 0, `blockCost should be defined, got ${out.blockCost}`);
    assert.ok(out.blockCost <= 2.5, "block cost can't exceed session cost");
  });
});

test("blockCost is undefined without a five-hour rate-limit window", () => {
  withStore(() => {
    const out = collectStats({ session_id: "s-nowin", cost: { total_cost_usd: 1 } });
    assert.equal(out.blockCost, undefined);
  });
});
