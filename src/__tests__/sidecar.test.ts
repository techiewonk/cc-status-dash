import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeUsageSidecar } from "../data/sidecar.js";

test("usage sidecar writes rate-limit JSON only when the env path is set", () => {
  const dir = mkdtempSync(join(tmpdir(), "ccsd-sidecar-"));
  const out = join(dir, "nested", "usage.json"); // nested → exercises mkdir
  const prev = process.env.CC_STATUS_DASH_USAGE_SIDECAR;
  try {
    // no env → no write
    delete process.env.CC_STATUS_DASH_USAGE_SIDECAR;
    writeUsageSidecar({ rate_limits: { five_hour: { used_percentage: 10, resets_at: 123 } } }, 1000);
    assert.ok(!existsSync(out), "no write without the env var");
    // env set → atomic write with the expected shape
    process.env.CC_STATUS_DASH_USAGE_SIDECAR = out;
    writeUsageSidecar({ rate_limits: { five_hour: { used_percentage: 42, resets_at: 555 }, seven_day: { used_percentage: 7, resets_at: 999 } } }, 2000);
    const data = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(data.five_hour.used_percentage, 42);
    assert.equal(data.seven_day.resets_at, 999);
    assert.equal(data.updated_at, 2000);
  } finally {
    if (prev === undefined) delete process.env.CC_STATUS_DASH_USAGE_SIDECAR; else process.env.CC_STATUS_DASH_USAGE_SIDECAR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
