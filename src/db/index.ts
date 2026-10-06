import Dexie from "dexie";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { State, Word } from "../types";
import seed from "./seed.json";
import { initializeReading } from "../features/reading/engine";
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const defaults = {
  theme: "system",
  goal: 30,
  count: "20",
  mode: "mixed",
  rareFirst: true,
  audio: true,
  audioVersion: 1,
  readingAuto: false,
};
class Database extends Dexie {
  state!: Dexie.Table<{ id: string; value: State }, string>;
  constructor() {
    super("lexiday-v1");
    this.version(1).stores({ state: "id" });
  }
}
export const db = new Database();
export async function loadState(): Promise<State> {
  const saved = await db.state.get("main");
  if (saved) {
    if (!saved.value.settings.audioVersion) {
      saved.value.settings = { ...saved.value.settings, audio: true, audioVersion: 1 };
      await saveState(saved.value);
    }
    const migrated = initializeReading({ ...saved.value, settings: { ...defaults, ...saved.value.settings } });
    await saveState(migrated);
    return migrated;
  }
  const now = Date.now();
  const words = (seed as Partial<Word>[]).map(
    (w, i) =>
      ({
        ...w,
        id: "seed-" + i,
        createdAt: now,
        updatedAt: now,
        tags: ["初始词表"],
      }) as Word,
  );
  const state: State = {
    words,
    records: {},
    days: [{ date: today(), wordIds: words.map((w) => w.id) }],
    attempts: [],
    settings: defaults,
  };
  const initialized = initializeReading(state);
  await saveState(initialized);
  return initialized;
}
export async function saveState(value: State) {
  await db.state.put({ id: "main", value });
}
const NativeBackup = registerPlugin<{ save(options: { name: string; data: string; mime: string }): Promise<{ cancelled?: boolean }> }>("NativeBackup");
export async function download(name: string, value: unknown) {
  return downloadText(name, JSON.stringify(value, null, 2), "application/json");
}
export async function downloadText(name: string, data: string, mime: string) {
  if (Capacitor.isNativePlatform()) {
    await NativeBackup.save({ name, data, mime });
    return;
  }
  const url = URL.createObjectURL(
    new Blob([data], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
