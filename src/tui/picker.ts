// Fuzzy widget picker logic (ccstatusline parity: substring / initialism /
// subsequence matching, ranked). Pure + unit-tested; the Ink overlay just renders
// whatever `fuzzyFilter` returns.

export interface PickItem {
  id: string;
  label: string;
  category: string;
}

/**
 * Subsequence score for `query` against `text`. Lower is better; `null` = no
 * match. Gaps between matched chars cost; adjacent matches get a small bonus.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q === "") return 0;
  let ti = 0;
  let score = 0;
  let prev = -1;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return null;
    score += idx - ti; // distance skipped since last match
    if (prev !== -1 && idx === prev + 1) score -= 0.5; // adjacency bonus
    prev = idx;
    ti = idx + 1;
  }
  return score + (t.length - q.length) * 0.1; // prefer shorter / tighter matches
}

/** Filter + rank items by the best score across their id and label. */
export function fuzzyFilter(query: string, items: PickItem[]): PickItem[] {
  if (!query) return items;
  const scored: { item: PickItem; score: number }[] = [];
  for (const item of items) {
    const a = fuzzyScore(query, item.id);
    const b = fuzzyScore(query, item.label);
    const best = a === null ? b : b === null ? a : Math.min(a, b);
    if (best !== null) scored.push({ item, score: best });
  }
  scored.sort((x, y) => x.score - y.score || x.item.id.localeCompare(y.item.id));
  return scored.map((s) => s.item);
}
