#!/usr/bin/env bash
# Local functionality smoke test — verifies the whole surface renders without
# crashing: every preset, every theme, every line style, both charsets, the
# inspection flags, env toggles, stats persistence, and the never-crash
# fallbacks. Exit code is non-zero if anything fails.
#
#   bun run build && bash scripts/smoke.sh      # (or: npm run build:node)
#
# It does NOT assert exact output (that's what `bun test src` is for) — it
# asserts "exit 0 + non-empty render" across the full matrix, the kind of
# breakage a unit test of one widget won't catch.
set -u
cd "$(dirname "$0")/.."

ENTRY="${ENTRY:-dist/index.js}"
INPUT="sample-input.json"
RUN="node $ENTRY"
pass=0; fail=0
ok()   { pass=$((pass+1)); }
bad()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
# assert: <label> — stdin payload piped in; expects exit 0 + non-empty stdout
assert_renders() { local label="$1"; shift; local out; out=$($RUN "$@" < "$INPUT" 2>/dev/null); local rc=$?; if [ $rc -eq 0 ] && [ -n "$out" ]; then ok; else bad "$label (rc=$rc, len=${#out})"; fi; }
assert_flag()    { local label="$1"; shift; local out; out=$($RUN "$@" </dev/null 2>/dev/null); local rc=$?; if [ $rc -eq 0 ] && [ -n "$out" ]; then ok; else bad "$label (rc=$rc)"; fi; }

[ -f "$ENTRY" ] || { echo "build first: bun run build (no $ENTRY)"; exit 2; }

echo "▸ inspection flags"
assert_flag "--list-widgets"  --list-widgets
assert_flag "--list-themes"   --list-themes
assert_flag "--list-presets"  --list-presets

echo "▸ every preset (x default theme)"
PRESETS=$($RUN --list-presets </dev/null 2>/dev/null | awk '{print $1}')
for p in $PRESETS; do assert_renders "preset=$p" --preset "$p"; done
echo "  ($(echo "$PRESETS" | wc -w | tr -d ' ') presets)"

echo "▸ every theme (x full preset)"
for t in $($RUN --list-themes </dev/null 2>/dev/null); do assert_renders "theme=$t" --preset full --theme "$t"; done

echo "▸ env + edge cases"
NO_COLOR=1 $RUN --preset full < "$INPUT" 2>/dev/null | grep -q $'\033' && bad "NO_COLOR still emitted ANSI" || ok          # must be plain
COLUMNS=40 assert_renders "autoWrap COLUMNS=40" --preset dashboard
[ "$(printf 'not json' | $RUN 2>/dev/null)" = "Claude" ] && ok || bad "invalid JSON should fall back to 'Claude'"
[ -n "$(printf '' | $RUN 2>/dev/null)" ] && ok || bad "empty stdin should still render"
[ "$(printf '{}' | $RUN 2>/dev/null | tr -d '[:space:]')" != "" ] && ok || bad "empty object payload"

echo "▸ stats persistence (throwaway XDG_STATE_HOME, stats-backed widget)"
TMPSTATE="$(mktemp -d)"; STATCFG="$(mktemp)"
printf '{"lines":[{"widgets":[{"id":"message-count"},{"id":"tokens-per-min"}]}]}' > "$STATCFG"
XDG_STATE_HOME="$TMPSTATE" $RUN --config "$STATCFG" < "$INPUT" >/dev/null 2>&1
XDG_STATE_HOME="$TMPSTATE" $RUN --config "$STATCFG" < "$INPUT" >/dev/null 2>&1
[ -f "$TMPSTATE/cc-status-dash/stats.json" ] && ok || bad "stats.json not written under XDG_STATE_HOME"
rm -rf "$TMPSTATE" "$STATCFG"

echo "▸ charset=text (ASCII) + minimalist via --config"
TXTCFG="$(mktemp)"; printf '{"charset":"text","minimalist":true,"preset":"full"}' > "$TXTCFG"
assert_renders "charset=text" --config "$TXTCFG"
rm -f "$TXTCFG"

echo
printf 'smoke: \033[32m%d passed\033[0m, %s%d failed\033[0m\n' "$pass" "$([ $fail -gt 0 ] && printf '\033[31m' || printf '\033[32m')" "$fail"
[ $fail -eq 0 ]
