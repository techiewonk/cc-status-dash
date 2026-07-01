import { test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters as strip } from "node:util";
import type { Config, RenderContext, StatuslineInput } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePalette } from "../themes/index.js";
import { render } from "../render/renderer.js";

// alignLabels: right-pads every inline/panel line's leading label to the widest
// label across all such lines, so stacked lines' values start at the same column
// (Claude HUD alignLabels parity — generalized to any label-bearing line, not
// HUD's fixed context/usage/weekly trio).

const INPUT: StatuslineInput = {};

function run(over: Partial<Config>): string {
  const config = { ...DEFAULT_CONFIG, colors: resolvePalette(DEFAULT_CONFIG.theme), padding: 0, ...over } as Config;
  return strip(render({ input: INPUT, data: {}, config } as RenderContext));
}

// custom-text has no label by default; env's label defaults to its variable name
// (or an explicit `prefix`) — a convenient way to construct labeled lines in tests.
function envLine(prefix: string, varName: string) {
  return { style: "inline" as const, widgets: [{ id: "env", variable: varName, prefix }] };
}

test("alignLabels pads shorter labels to match the widest one across lines", () => {
  process.env.CCSD_TEST_A = "1";
  process.env.CCSD_TEST_BB = "2";
  try {
    const out = run({ alignLabels: true, lines: [envLine("A", "CCSD_TEST_A"), envLine("BB", "CCSD_TEST_BB")] });
    const [l1, l2] = out.split("\n");
    assert.equal(l1, "A  1", `shorter label padded to match "BB": ${JSON.stringify(l1)}`);
    assert.equal(l2, "BB 2", `widest label unchanged: ${JSON.stringify(l2)}`);
  } finally {
    delete process.env.CCSD_TEST_A;
    delete process.env.CCSD_TEST_BB;
  }
});

test("alignLabels unset (default) leaves labels exactly as rendered — no config, no change", () => {
  process.env.CCSD_TEST_A = "1";
  process.env.CCSD_TEST_BB = "2";
  try {
    const out = run({ lines: [envLine("A", "CCSD_TEST_A"), envLine("BB", "CCSD_TEST_BB")] });
    const [l1, l2] = out.split("\n");
    assert.equal(l1, "A 1");
    assert.equal(l2, "BB 2");
  } finally {
    delete process.env.CCSD_TEST_A;
    delete process.env.CCSD_TEST_BB;
  }
});

test("lines with no leading label (e.g. minimalist, or a label-less widget) are left untouched", () => {
  process.env.CCSD_TEST_BB = "2";
  try {
    const out = run({
      alignLabels: true,
      lines: [
        { style: "inline", widgets: [{ id: "custom-text", text: "no-label-here" }] },
        envLine("BB", "CCSD_TEST_BB"),
      ],
    });
    const [l1, l2] = out.split("\n");
    assert.equal(l1, "no-label-here", "unlabeled line is never padded");
    assert.equal(l2, "BB 2", "labeled line is unaffected by an unlabeled sibling");
  } finally {
    delete process.env.CCSD_TEST_BB;
  }
});

test("powerline/capsule lines are excluded from alignment (no equivalent concept)", () => {
  process.env.CCSD_TEST_A = "1";
  try {
    // Only one alignable (inline) line exists, so this just proves no crash / no
    // effect when the config also contains non-alignable line styles.
    const out = run({
      alignLabels: true,
      lines: [
        { style: "powerline", widgets: [{ id: "custom-text", text: "PL" }] },
        envLine("A", "CCSD_TEST_A"),
      ],
    });
    assert.ok(out.includes("A 1"), `inline line unaffected by a sibling powerline line: ${JSON.stringify(out)}`);
  } finally {
    delete process.env.CCSD_TEST_A;
  }
});
