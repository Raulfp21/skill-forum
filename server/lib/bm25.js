const STOP = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','he','her','his',
  'i','in','is','it','its','of','on','or','our','she','that','the','their','them','they','this',
  'to','was','we','were','will','with','you','your','which','while','than','then','there','these',
  'not','no','so','if','do','does','did','can','could','should','would','may','might','about',
]);

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export function buildIndex(chunks) {
  const df = new Map();
  const tf = new Map();
  const docLen = [];
  const avgdl = (() => {
    let sum = 0;
    chunks.forEach((c, i) => {
      const tokens = tokenize(c.text);
      docLen[i] = tokens.length;
      sum += tokens.length;
      const counts = new Map();
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
      tf.set(i, counts);
      for (const t of counts.keys()) df.set(t, (df.get(t) || 0) + 1);
    });
    return chunks.length ? sum / chunks.length : 1;
  })();
  const idf = (t) => {
    const n = df.get(t) || 0;
    return Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5));
  };
  return { chunks, tf, df, docLen, avgdl, idf };
}

export function search(index, query, k = 6) {
  const { chunks, tf, df, docLen, avgdl, idf } = index;
  const k1 = 1.5;
  const b = 0.75;
  const qTokens = tokenize(query);
  if (!qTokens.length || !chunks.length) return [];

  const scores = new Array(chunks.length).fill(0);
  for (const q of qTokens) {
    if (!df.has(q)) continue;
    const w = idf(q);
    for (let i = 0; i < chunks.length; i++) {
      const c = tf.get(i).get(q);
      if (!c) continue;
      const denom = c + k1 * (1 - b + (b * docLen[i]) / avgdl);
      scores[i] += w * ((c * (k1 + 1)) / denom);
    }
  }

  return scores
    .map((score, i) => ({ chunk: chunks[i], score }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
