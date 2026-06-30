// Strip C0/C1 control bytes (incl. ESC/BEL) from untrusted strings before they
// reach the rendered statusline. Repo/transcript content (file names, branch &
// remote names, tool targets, todo text) is attacker-influenceable and could
// otherwise inject terminal escape sequences (cursor moves, OSC 52 clipboard,
// screen clears, forged UI). Newlines are removed too - the statusline is one line.
// Built via new RegExp from an all-ASCII string so the source carries no control bytes.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

export function stripControl(s: string): string {
  return s.replace(CONTROL, "");
}

/** Same, but tolerant of non-strings (returns the value unchanged when not a string). */
export function clean<T extends string | undefined | null>(s: T): T {
  return (typeof s === "string" ? (stripControl(s) as T) : s);
}
