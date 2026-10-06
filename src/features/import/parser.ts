import { newId } from "../../utils/id";
import type { Word, State } from "../../types";
export type Draft = Partial<Word> & {
  word: string;
  commonMeaning: string;
  selected: boolean;
};
const aliases: Record<string, string[]> = {
  word: ["word", "单词", "单词/短语", "单词／短语", "词汇", "英文"],
  phonetic: ["phonetic", "音标"],
  commonMeaning: [
    "commonmeaning",
    "common_meaning",
    "common",
    "常见意思",
    "常见义",
    "中文",
    "释义",
  ],
  rareMeaning: [
    "raremeaning",
    "rare_meaning",
    "rare",
    "熟词僻义",
    "考研熟词僻义/语境义",
    "考研熟词僻义",
    "语境义",
  ],
  usage: [
    "usage",
    "用法",
    "常用搭配与用法",
    "常用搭配",
    "固定搭配",
    "搭配与用法",
  ],
  example: ["example", "例句"],
  source: ["source", "来源"],
  tags: ["tags", "标签"],
};
const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
export function fromRows(rows: unknown[][]): Draft[] {
  let map: Record<number, string> = {};
  const out: Draft[] = [];
  for (const raw of rows) {
    const row = raw.map((v) => String(v ?? "").trim());
    const candidate: Record<number, string> = {};
    row.forEach((v, i) => {
      for (const [key, names] of Object.entries(aliases))
        if (names.includes(norm(v))) candidate[i] = key;
    });
    if (
      Object.values(candidate).includes("word") &&
      Object.values(candidate).includes("commonMeaning")
    ) {
      map = candidate;
      continue;
    }
    if (!Object.keys(map).length) continue;
    const d: Record<string, unknown> = { selected: true };
    Object.entries(map).forEach(([i, k]) => (d[k] = row[Number(i)] || ""));
    d.word = String(d.word || "").replace(/^\d+[.、．]\s*/, "");
    if (d.word && d.commonMeaning) {
      if (d.tags) d.tags = String(d.tags).split(/[,，;；]/);
      out.push(d as Draft);
    }
  }
  return out;
}

/**
 * Reads the two-column "study card" layout used by our formatted Word lists:
 * left = numbered word / phonetic / part of speech, right = labeled details.
 * This is deliberately strict enough to ignore cover notes and summary tables.
 */
export function fromWordCards(rows: unknown[][]): Draft[] {
  const fieldLabels: Array<[keyof Draft, RegExp]> = [
    ["commonMeaning", /^(?:核心义|常见意思|常见义|释义)\s*[:：]?\s*/],
    ["rareMeaning", /^(?:考研点|考研熟词僻义(?:\s*[/／]\s*语境义)?|熟词僻义(?:\s*[/／]\s*阅读考点)?|阅读考点|语境义)\s*[:：]?\s*/],
    ["usage", /^(?:常用搭配与用法|常用搭配|固定搭配|搭配与用法|搭配|用法)\s*[:：]?\s*/],
    ["example", /^(?:例句)\s*[:：]?\s*/],
  ];
  const drafts: Draft[] = [];
  for (const raw of rows) {
    if (raw.length !== 2) continue;
    const left = String(raw[0] ?? "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const title = left[0]?.match(/^\s*\d{1,4}[.、．]\s*(.+?)\s*$/);
    if (!title || !/[a-z]/i.test(title[1])) continue;
    const word = title[1].trim();
    if (word.length > 100) continue;
    const phonetic = left.slice(1).find((line) => /^\/.+\/$/.test(line)) || "";
    const details: Partial<Draft> = {};
    let active: keyof Draft | "" = "";
    for (const line of String(raw[1] ?? "")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean)) {
      const label = fieldLabels.find(([, pattern]) => pattern.test(line));
      if (label) {
        active = label[0];
        details[active] = line.replace(label[1], "").trim() as never;
      } else if (active) {
        const previous = String(details[active] || "");
        details[active] = `${previous}${previous ? "；" : ""}${line}` as never;
      }
    }
    if (!details.commonMeaning) continue;
    drafts.push({
      word,
      phonetic,
      commonMeaning: details.commonMeaning,
      rareMeaning: details.rareMeaning || "",
      usage: details.usage || "",
      example: details.example || "",
      selected: true,
    });
  }
  return drafts;
}

export async function parseFile(file: File): Promise<Draft[]> {
  if (file.size > 20 * 1024 * 1024)
    throw Error("文件超过 20 MB，请拆分后导入。");
  const ext = file.name.split(".").pop()?.toLowerCase();
  let rows: Draft[] = [];
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({
      arrayBuffer: await file.arrayBuffer(),
    });
    const dom = new DOMParser().parseFromString(result.value, "text/html");
    const tableRows = Array.from(dom.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.children)
        .filter((cell) => cell.matches("td,th"))
        .map((cell) => {
        const paragraphs = Array.from(cell.children)
          .filter((child) => child.matches("p"))
          .map((p) => p.textContent?.trim() || "")
          .filter(Boolean);
        return paragraphs.length ? paragraphs.join("\n") : cell.textContent || "";
        }),
    );
    rows = fromRows(tableRows);
    if (!rows.length) rows = fromWordCards(tableRows);
    if (!rows.length) {
      let current: Record<string, string> = {};
      const records: Record<string, string>[] = [];
      for (const p of Array.from(dom.querySelectorAll("p"))) {
        const text = p.textContent || "";
        const m = text.match(/^([^:：]+)[:：]\s*(.*)$/);
        if (m) {
          const key = Object.entries(aliases).find(([, names]) =>
            names.includes(norm(m[1])),
          )?.[0];
          if (key) {
            if (key === "word" && current.word) {
              records.push(current);
              current = {};
            }
            current[key] = m[2];
          }
        }
      }
      if (current.word) records.push(current);
      rows = records
        .filter((x) => x.word && x.commonMeaning)
        .map((x) => ({ ...x, selected: true }) as Draft);
    }
  } else if (ext === "xlsx" || ext === "csv") {
    const XLSX = await import("xlsx");
    const book =
      ext === "csv"
        ? XLSX.read(await file.text(), { type: "string" })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
    rows = book.SheetNames.flatMap((n) =>
      fromRows(
        XLSX.utils.sheet_to_json(book.Sheets[n], {
          header: 1,
          defval: "",
        }) as unknown[][],
      ),
    );
  } else if (ext === "json") {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.words;
    if (!Array.isArray(list))
      throw Error("JSON 需要单词数组或包含 words 数组。");
    rows = list
      .map((obj) => {
        const d: Record<string, unknown> = { selected: true };
        for (const [k, v] of Object.entries(obj)) {
          const key = Object.entries(aliases).find(([, a]) =>
            a.includes(norm(k)),
          )?.[0];
          if (key)
            d[key] = key === "tags" && Array.isArray(v) ? v : String(v ?? "");
        }
        return d as Draft;
      })
      .filter((x) => x.word && x.commonMeaning);
  } else throw Error("请选择 DOCX、XLSX、CSV 或 JSON 文件。");
  if (!rows.length)
    throw Error(
      "未识别到词汇。支持带“单词/常见意思”表头的表格，以及带“核心义/考研点/搭配”的双栏词汇卡片；扫描或手写词表请使用“拍照导入”选择照片。",
    );
  return rows.map((x) => ({ ...x, source: file.name }));
}
export function mergeImport(
  state: State,
  drafts: Draft[],
  policy: string,
  date: string,
): State {
  const words = state.words.map((w) => ({ ...w }));
  const byWord = new Map(words.map((w) => [w.word.trim().toLowerCase(), w]));
  const originalIds = new Set(state.words.map((w) => w.id));
  const ids: string[] = [];
  for (const d of drafts.filter(
    (x) => x.selected && x.word.trim() && x.commonMeaning.trim(),
  )) {
    const key = d.word.trim().toLowerCase();
    let w = byWord.get(key);
    if (w) {
      if (policy !== "skip")
        for (const k of [
          "phonetic",
          "commonMeaning",
          "rareMeaning",
          "usage",
          "example",
        ] as const) {
          const value = d[k] || "";
          w[k] =
            policy === "overwrite"
              ? value
              : !value || w[k].includes(value)
                ? w[k]
                : w[k]
                  ? w[k] + "；" + value
                  : value;
        }
      w.updatedAt = Date.now();
    } else {
      w = {
        id: newId(),
        word: d.word.trim(),
        phonetic: d.phonetic || "",
        commonMeaning: d.commonMeaning,
        rareMeaning: d.rareMeaning || "",
        usage: d.usage || "",
        example: d.example || "",
        tags: d.tags || [],
        source: d.source || "导入",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      words.push(w);
      byWord.set(key, w);
    }
    if (policy !== "skip" || !originalIds.has(w.id)) ids.push(w.id);
  }
  const days = state.days.map((d) => ({ ...d }));
  const day = days.find((d) => d.date === date);
  if (day) day.wordIds = [...new Set([...day.wordIds, ...ids])];
  else if (ids.length) days.push({ date, wordIds: [...new Set(ids)] });
  return { ...state, words, days };
}
