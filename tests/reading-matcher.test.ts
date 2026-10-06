import test from "node:test";
import assert from "node:assert/strict";
import nounExceptions from "wink-lexicon/src/wn-noun-exceptions.js";
import verbExceptions from "wink-lexicon/src/wn-verb-exceptions.js";
import adjectiveExceptions from "wink-lexicon/src/wn-adjective-exceptions.js";
import { containsWord, findWordMatches, findHighlights } from "../src/features/reading/matcher";

test("general inflections and phrases use the same locations for matching and highlighting", () => {
  const examples = [
    ["borrow", "borrowed"], ["borrow", "borrowing"], ["write", "written"], ["go", "went"],
    ["child", "children"], ["analysis", "analyses"], ["mouse", "mice"], ["knife", "knives"],
    ["study", "studied"], ["run", "running"], ["big", "bigger"], ["easy", "easiest"],
    ["be prone to", "was\u00a0prone to"], ["look after", "looked\nafter"], ["give up", "given up"],
    ["tin-roofed", "tin\u2011roofed"], ["state-of-the-art", "state of the art"],
    ["company", "company’s"], ["child", "children’s"], ["borrow", "BOR\u200bROWED"],
    ["affiliation", "a\ufb03liation"], ["borrow", "ＢＯＲＲＯＷＥＤ"], ["C++", "C++"],
    ["microtag", "microtagged"], ["codexify", "codexified"], ["codexify", "codexifying"],
  ];
  for (const [word, surface] of examples) {
    const text = `“${surface},” said the teacher.`;
    assert(containsWord(text, word), `${word} → ${surface}`);
    const [match] = findWordMatches(text, word);
    assert.equal(text.slice(match.start, match.end), surface);
    const [highlight] = findHighlights(text, [{ id: "target", word }]);
    assert.equal(highlight.surface, surface);
    assert.equal(highlight.wordId, "target");
  }
});

test("the full bundled irregular-word corpus is recognized, beyond selected examples", () => {
  let checked = 0;
  for (const table of [nounExceptions, verbExceptions, adjectiveExceptions]) {
    for (const [surface, word] of Object.entries(table)) {
      if (!/^[a-z]{2,}$/.test(surface) || !/^[a-z]{2,}$/.test(word)) continue;
      assert(containsWord(`They discussed ${surface}.`, word), `${word} → ${surface}`);
      checked++;
    }
  }
  assert(checked > 2000);
  console.log("Irregular surface/base pairs verified:", checked);
});

test("previously unseen imported terms work with productive inflection rules", () => {
  for (let i = 0; i < 300; i++) {
    const word = `lexiqu${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}ate`;
    for (const surface of [word + "s", word + "d", word.slice(0, -1) + "ing"]) {
      assert(containsWord(`They ${surface} carefully.`, word), `${word} → ${surface}`);
    }
  }
});

test("different words and cross-sentence fragments do not inflate vocabulary coverage", () => {
  for (const [word, other] of [["hope", "hopeful"], ["form", "formula"], ["borrow", "borrower"], ["hop", "hoped"],
    ["art", "part"], ["an", "can"], ["use", "user"], ["wide", "widow"], ["late", "lateral"], ["target1", "target10"], ["C++", "C"]]) {
    assert.equal(containsWord(other, word), false, `${word} ≠ ${other}`);
  }
  assert.equal(containsWord("We look. After lunch, we rest.", "look after"), false);
  assert.equal(containsWord("anything", ""), false);
  const matches = findHighlights("They gave up and gave advice.", [{ id: "verb", word: "give" }, { id: "phrase", word: "give up" }]);
  assert.deepEqual(matches.map(m => [m.surface, m.wordId]), [["gave up", "phrase"], ["gave", "verb"]]);
});
