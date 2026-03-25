import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const _raw = require('./pricing.json');

const MODEL_PRICING = Object.fromEntries(
  Object.entries(_raw).filter(([k]) => !k.startsWith('_'))
);

export function normalizeModelName(name) {
  if (!name) return null;
  let n = name.toLowerCase().trim();

  // Strip provider prefixes
  const slashIdx = n.lastIndexOf('/');
  if (slashIdx !== -1) n = n.substring(slashIdx + 1);

  // Strip dot-delimited provider prefixes
  const dotParts = n.split('.');
  if (dotParts.length > 1) {
    const prefixes = dotParts.slice(0, -1);
    const last = dotParts[dotParts.length - 1];
    if (last.includes('-') && prefixes.every(p => !p.includes('-'))) n = last;
  }

  if (n.startsWith('model_')) n = n.substring(6).replace(/_/g, '-');

  const candidates = [n];
  if (n.includes('.')) candidates.push(n.replace(/\./g, '-'));

  for (const c of [...candidates]) {
    const rev = c.match(/^(claude)-(\d+)-(\d+)-(opus|sonnet|haiku)/);
    if (rev) candidates.push(`${rev[1]}-${rev[4]}-${rev[2]}-${rev[3]}`);
  }

  // Exact match
  for (const c of candidates) {
    if (MODEL_PRICING[c]) return c;
  }
  // Strip date suffix
  for (const c of candidates) {
    const withoutDate = c.replace(/-\d{4}-?\d{2}-?\d{2}$/, '');
    if (MODEL_PRICING[withoutDate]) return withoutDate;
    const withoutTag = c.replace(/:(latest|thinking)$/, '');
    if (MODEL_PRICING[withoutTag]) return withoutTag;
    const withoutQual = c.replace(/-(thinking|high|xhigh|preview|latest)(-thinking|-high|-xhigh|-preview)*/g, '');
    if (withoutQual !== c && MODEL_PRICING[withoutQual]) return withoutQual;
  }
  // Fuzzy startsWith
  const keys = Object.keys(MODEL_PRICING);
  for (const c of candidates) {
    let best = null;
    for (const key of keys) {
      if (c.startsWith(key) && (!best || key.length > best.length)) best = key;
    }
    if (best) return best;
  }
  return null;
}

export function calculateCost(modelName, inputTokens, outputTokens, cacheRead, cacheWrite) {
  const key = normalizeModelName(modelName);
  if (!key) return null;
  const pricing = MODEL_PRICING[key];
  if (!pricing) return null;

  const input = ((inputTokens || 0) / 1_000_000) * pricing.input;
  const output = ((outputTokens || 0) / 1_000_000) * pricing.output;
  const cr = ((cacheRead || 0) / 1_000_000) * pricing.cacheRead;
  const cw = ((cacheWrite || 0) / 1_000_000) * pricing.cacheWrite;

  return input + output + cr + cw;
}
