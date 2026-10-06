import type { Word, Question } from "../../types";
export const modes: Record<string, string> = {
  mixed: "智能混合",
  en: "英译中",
  zh: "中译英",
  rare: "熟词僻义",
  usage: "固定搭配",
  spell: "拼写",
  judge: "判断",
};
export const shuffle = <T>(a: T[]) =>
  a
    .map((v) => ({ v, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.v);
export function question(
  w: Word,
  all: Word[],
  mode: string,
  rareFirst: boolean,
): Question {
  let type =
    mode === "mixed"
      ? shuffle(
          rareFirst && w.rareMeaning
            ? ["rare", "rare", "rare", "en", "zh", "spell", "judge", "usage"]
            : ["en", "zh", "spell", "judge", "usage"],
        )[0]
      : mode;
  if (type === "rare" && !w.rareMeaning) type = "en";
  if (type === "usage" && !w.usage) type = "en";
  let answer =
    type === "zh" || type === "spell"
      ? w.word
      : type === "rare"
        ? w.rareMeaning
        : type === "usage"
          ? w.usage
          : w.commonMeaning;
  let prompt = type === "zh" || type === "spell" ? w.commonMeaning : w.word;
  let subtitle =
    type === "rare"
      ? "请选择这个词的考研熟词僻义"
      : type === "usage"
        ? "请选择词表中对应的搭配与用法"
        : type === "spell"
          ? "根据中文释义，拼写英文单词"
          : type === "zh"
            ? "请选择对应的英文单词"
            : "请选择正确的中文释义";
  let options: string[] = [];
  if (type === "judge") {
    const yes = Math.random() > 0.5;
    const offset = Math.floor(Math.random() * all.length);
    let other: Word | undefined;
    for (let i = 0; i < all.length; i++) {
      const candidate = all[(offset + i) % all.length];
      if (
        candidate.id !== w.id &&
        candidate.commonMeaning !== w.commonMeaning
      ) {
        other = candidate;
        break;
      }
    }
    prompt = w.word;
    subtitle =
      "这个释义是否正确？ " +
      (yes || !other ? w.commonMeaning : other.commonMeaning);
    answer = yes || !other ? "正确" : "错误";
    options = ["正确", "错误"];
  } else if (type !== "spell") {
    const distractors = new Set<string>();
    const offset = Math.floor(Math.random() * all.length);
    for (let i = 0; i < all.length && distractors.size < 3; i++) {
      const x = all[(offset + i) % all.length];
      const value =
        type === "zh"
          ? x.word
          : type === "rare"
            ? x.rareMeaning
            : type === "usage"
              ? x.usage
              : x.commonMeaning;
      if (x.id !== w.id && value && value !== answer) distractors.add(value);
    }
    options = shuffle([answer, ...distractors]);
    if (options.length < 4) {
      type = "spell";
      answer = w.word;
      prompt = w.commonMeaning;
      subtitle = "可用干扰项不足，请拼写英文单词";
      options = [];
    }
  }
  return { wordId: w.id, type, prompt, subtitle, options, answer };
}
