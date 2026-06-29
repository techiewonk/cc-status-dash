import { createElement } from "react";
import type { Config } from "../types.js";

// Lazy launcher for the Ink TUI. Imported only when `--tui` runs, so ink/react
// never load on the statusline render path.
export async function launchTui(initial: Config, savePath: string): Promise<void> {
  const [{ render }, { App }] = await Promise.all([import("ink"), import("./app.js")]);
  const { waitUntilExit } = render(createElement(App, { initial, savePath }));
  await waitUntilExit();
}
