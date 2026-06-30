# VHS tape for the README demo GIF.
# Render:  docker run --rm -v "$PWD:/vhs" -w /vhs ghcr.io/charmbracelet/vhs docs/demo.tape
# (Regenerate the embedded frames first: bun run build && bash scripts/build-demo.sh)

Output docs/demo.gif

Require bash
Set Shell bash
Set FontFamily "JetBrainsMono Nerd Font"
Set FontSize 17
Set Width 1240
Set Height 300
Set Padding 26
Set Theme "TokyoNight"
Set PlaybackSpeed 1.0

Hide
Type "bash scripts/demo.sh" Enter
Show
Sleep 27s
