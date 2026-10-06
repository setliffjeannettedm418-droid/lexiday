import lemmatize from "wink-lemmatizer";
import nounExceptions from "wink-lexicon/src/wn-noun-exceptions.js";
import verbExceptions from "wink-lexicon/src/wn-verb-exceptions.js";
import adjectiveExceptions from "wink-lexicon/src/wn-adjective-exceptions.js";

export interface WordMatch { start: number; end: number; surface: string; exact: boolean }
interface Token { value: string; start: number; end: number }
interface Document { text: string; starts: number[]; ends: number[]; tokens: Token[] }
const documents = new Map<string, Document>();
const roots = new Map<string, Set<string>>();
const letterOrNumber = /[\p{L}\p{M}\p{N}]/u;

/** Preserve offsets into the original text, including ligatures and invisible characters. */
function document(raw: string): Document {
  const cached = documents.get(raw); if (cached) return cached;
  let text = "", offset = 0; const starts: number[] = [], ends: number[] = [];
  for (const original of raw) {
    const normalized = original.normalize("NFKC").toLowerCase()
      .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u2010-\u2015\u2212\ufe63\uff0d]/g, "-");
    for (let i = 0; i < normalized.length; i++) { starts.push(offset); ends.push(offset + original.length); }
    text += normalized; offset += original.length;
  }
  const tokens = [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu)]
    .map(m => ({ value: m[0], start: m.index!, end: m.index! + m[0].length }));
  const result = { text, starts, ends, tokens };
  if (documents.size >= 128) documents.delete(documents.keys().next().value!);
  documents.set(raw, result); return result;
}

export const normalizeWord = (word: string) => document(word).text.trim().replace(/\s+/g, " ");

/** Keep original offsets for tapping words outside the learning targets. */
export function readingTokens(raw: string) {
  return [...raw.matchAll(/[\p{L}\p{M}]+(?:['’ʼ\-‐‑][\p{L}\p{M}]+)*/gu)]
    .map(m => ({ surface: m[0], start: m.index!, end: m.index! + m[0].length }));
}
export const dictionaryCandidates = (word: string) => [...lemmas(normalizeWord(word))];

/** A lexical lemmatizer, not a prefix/stem match: hopeful does not count as hope. */
function lemmas(token: string) {
  const cached = roots.get(token); if (cached) return cached;
  const value = token.replace(/'s$/, "");
  const result = new Set([token, value]);
  if (/^[a-z]{2,}$/.test(value)) {
    const candidates = [[lemmatize.noun(value), nounExceptions[value]], [lemmatize.verb(value), verbExceptions[value]], [lemmatize.adjective(value), adjectiveExceptions[value]]];
    for (const [i, [lemma, exception]] of candidates.entries()) {
      // WordNet's first suffix candidate can be ambiguous (hoped → hop/hope).
      // Verify a round trip, or an explicit irregular entry, before using it.
      if (lemma && lemma.length >= 2 && (exception === lemma || regularForms(lemma, i === 2).has(value))) result.add(lemma);
    }
  }
  if (roots.size >= 10000) roots.clear();
  roots.set(token, result); return result;
}
function equivalent(a: string, b: string) {
  if (a === b) return true;
  const right = lemmas(b);
  if ([...lemmas(a)].some(root => right.has(root))) return true;
  // New technical terms may be absent from WordNet. Apply productive inflection
  // rules only when the surface has no conflicting known lemma.
  return (right.size === 1 && regularForms(a).has(b)) || (lemmas(a).size === 1 && regularForms(b).has(a));
}
const regularCache = new Map<string, Set<string>>();
function regularForms(base: string, comparison = false): Set<string> {
  const key = `${base}:${comparison}`;
  const cached = regularCache.get(key); if (cached) return cached;
  const forms = new Set<string>();
  if (/^[a-z]{3,}$/.test(base)) {
    if (!/[^aeiou]y$/.test(base)) forms.add(base + "s");
    if (/(s|x|z|ch|sh|o)$/.test(base)) forms.add(base + "es");
    const cvc = /[^aeiou][aeiou][bcdfghjklmnpqrstvz]$/.test(base);
    const double = cvc && (base.match(/[aeiou]+/g)?.length || 0) === 1;
    if (/[^aeiou]y$/.test(base)) { forms.add(base.slice(0, -1) + "ies"); forms.add(base.slice(0, -1) + "ied"); }
    else forms.add(base.endsWith("e") ? base + "d" : base + (double ? base.at(-1) : "") + "ed");
    const stem = /[^eoy]e$/.test(base) ? base.slice(0, -1) : base + (double ? base.at(-1) : "");
    forms.add(stem + "ing");
    if (/ie$/.test(base)) forms.add(base.slice(0, -2) + "ying");
    if (cvc) {
      forms.add(base + base.at(-1) + "ed"); forms.add(base + base.at(-1) + "ing");
    }
    if (base.endsWith("c")) { forms.add(base + "ked"); forms.add(base + "king"); }
    if (comparison) {
      const comparativeStem = /[^aeiou]y$/.test(base) ? base.slice(0, -1) + "i" : base.endsWith("e") ? base.slice(0, -1) : base + (double ? base.at(-1) : "");
      forms.add(comparativeStem + "er"); forms.add(comparativeStem + "est");
    }
  }
  if (regularCache.size >= 10000) regularCache.clear();
  regularCache.set(key, forms); return forms;
}

export function findWordMatches(raw: string, word: string): WordMatch[] {
  const body = document(raw), target = document(word.trim());
  if (!target.text.trim()) return [];
  const matches = new Map<string, WordMatch>();
  const add = (start: number, end: number, exact: boolean) => {
    const a = body.starts[start], b = body.ends[end - 1];
    if (a === undefined || b === undefined) return;
    const key = `${a}:${b}`, previous = matches.get(key);
    matches.set(key, { start: a, end: b, surface: raw.slice(a, b), exact: exact || !!previous?.exact });
  };
  // Literal fallback supports arbitrary imported spellings, e.g. abbreviations and C++.
  for (let start = body.text.indexOf(target.text); start >= 0; start = body.text.indexOf(target.text, start + 1)) {
    const end = start + target.text.length;
    if ((start === 0 || !letterOrNumber.test(body.text[start - 1])) && (end === body.text.length || !letterOrNumber.test(body.text[end]))) add(start, end, true);
  }
  const parts = target.tokens;
  // Inflect contiguous phrases and hyphenated compounds; never skip sentence punctuation.
  if (parts.length && parts[0].start === 0 && parts.at(-1)!.end === target.text.length &&
      parts.every((p, i) => i === 0 || /^[\s-]+$/.test(target.text.slice(parts[i - 1].end, p.start)))) {
    for (let i = 0; i + parts.length <= body.tokens.length; i++) {
      const selected = body.tokens.slice(i, i + parts.length);
      if (selected.every((token, j) => equivalent(parts[j].value, token.value) &&
          (j === 0 || /^[\s-]+$/.test(body.text.slice(selected[j - 1].end, token.start))))) {
        add(selected[0].start, selected.at(-1)!.end, selected.every((token, j) => parts[j].value === token.value));
      }
    }
  }
  return [...matches.values()].sort((a, b) => a.start - b.start || b.end - a.end);
}
export const containsWord = (text: string, word: string) => findWordMatches(text, word).length > 0;

export function findHighlights(text: string, words: { id: string; word: string }[]) {
  const candidates = words.flatMap(w => findWordMatches(text, w.word).map(match => ({ ...match, wordId: w.id, word: w.word })));
  candidates.sort((a, b) => a.start - b.start || b.end - a.end || Number(b.exact) - Number(a.exact));
  const selected: typeof candidates = []; let end = 0;
  for (const match of candidates) { if (match.start < end) continue; selected.push(match); end = match.end; }
  return selected;
}
