import type { State, Word } from "../../types";
import { today } from "../../db";
import { newId } from "../../utils/id";
import { dictionaryCandidates, normalizeWord } from "./matcher";
import type { LookupSelection } from "./lookup";

export interface CollectedWord { word: string; phonetic: string; commonMeaning: string; contextMeaning: string; usage: string }
export const isWordInDay = (state: State, id: string, date = today()) => state.days.some(day => day.date === date && day.wordIds.includes(id));
export function addWordToDay(state: State, id: string, date = today()): State {
  if (!state.words.some(word => word.id === id)) throw new Error("没有找到这个单词，请重新打开阅读。");
  const wordIds = [...new Set([...state.days.filter(day => day.date === date).flatMap(day => day.wordIds), id])];
  const first = state.days.findIndex(day => day.date === date);
  return { ...state, days: first < 0 ? [...state.days, { date, wordIds }] : state.days.flatMap((day, index) => day.date !== date ? [day] : index === first ? [{ ...day, wordIds }] : []) };
}
export function addCollectedWord(state: State, selection: LookupSelection, draft: CollectedWord, origin: { tags: string[]; source: string }, date = today()) {
  if (!draft.word.trim() || !draft.commonMeaning.trim()) throw new Error("请先取得可用的词义。");
  const candidates = dictionaryCandidates(selection.surface);
  if (!candidates.includes(normalizeWord(draft.word))) throw new Error("原形与所选词不一致，请核对词典后再加入。");
  const existing = state.words.find(word => normalizeWord(word.word) === normalizeWord(draft.word))
    || state.words.find(word => candidates.includes(normalizeWord(word.word)));
  const now = Date.now();
  const word: Word = existing || { id: newId(), word: draft.word.trim(), phonetic: draft.phonetic, commonMeaning: draft.commonMeaning.trim(), rareMeaning: "", usage: draft.usage,
    example: selection.sentence, tags: origin.tags, source: origin.source, createdAt: now, updatedAt: now };
  return { word, state: addWordToDay({ ...state, words: existing ? state.words : [...state.words, word] }, word.id, date) };
}
export function collectReadingWord(state: State, batchId: string, index: number, selection: LookupSelection, draft: CollectedWord, date = today()) {
  const article = state.reading?.batches.find(batch => batch.id === batchId)?.articles[index];
  if (!article || !(article.title === selection.sentence || article.sentences.some(sentence => sentence.english === selection.sentence))
    || selection.sentence.slice(selection.start, selection.start + selection.surface.length) !== selection.surface)
    throw new Error("原文已更新，请重新选择单词。");
  return addCollectedWord(state, selection, draft, { tags: ["阅读采集"], source: `阅读巩固 · ${article.title}` }, date).state;
}
