import { writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { StatuslineInput } from "../types.js";

// Usage sidecar writer (Phase 4): when CC_STATUS_DASH_USAGE_SIDECAR points at a
// path, emit the current rate-limit usage as JSON so OTHER tools (or another
// cc-status-dash instance via the `external-usage` widget) can read it. Opt-in,
// best-effort, atomic — a write failure never affects rendering.

export function writeUsageSidecar(input: StatuslineInput, now: number): void {
  const path = process.env.CC_STATUS_DASH_USAGE_SIDECAR;
  if (!path) return;
  const rl = input.rate_limits;
  if (!rl) return;
  try {
    const payload = {
      five_hour: rl.five_hour ? { used_percentage: rl.five_hour.used_percentage, resets_at: rl.five_hour.resets_at } : undefined,
      seven_day: rl.seven_day ? { used_percentage: rl.seven_day.used_percentage, resets_at: rl.seven_day.resets_at } : undefined,
      updated_at: now,
    };
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload));
    renameSync(tmp, path);
  } catch {
    /* best-effort: never break the render path */
  }
}
