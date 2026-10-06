import { Capacitor, registerPlugin } from "@capacitor/core";
export type Accent = "us" | "gb";
export type Speak = (word: string, accent?: Accent) => Promise<void>;
const NativeSpeech = registerPlugin<{
  speak(options: { text: string; accent: Accent }): Promise<void>;
  prepare(options: { text: string }): Promise<void>;
  stop(): Promise<void>;
}>("NativeSpeech");
let revision = 0;
export async function stopSpeech() {
  revision++;
  if (Capacitor.isNativePlatform()) await NativeSpeech.stop().catch(() => {});
  else if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
export async function prepareSpeech(text: string) {
  if (Capacitor.isNativePlatform()) await NativeSpeech.prepare({ text }).catch(() => {});
}
export const pronounce: Speak = async (text, accent = "us") => {
  const ticket = ++revision;
  if (Capacitor.isNativePlatform()) return NativeSpeech.speak({ text, accent });
  if (!("speechSynthesis" in window)) throw new Error("此设备的网页发音不可用，请使用新版 Android App");
  speechSynthesis.cancel();
  if (!speechSynthesis.getVoices().length) {
    await new Promise<void>(resolve => {
      const ready = () => { clearTimeout(timer); speechSynthesis.removeEventListener("voiceschanged", ready); resolve(); };
      const timer = setTimeout(ready, 1500);
      speechSynthesis.addEventListener("voiceschanged", ready);
    });
  }
  if (ticket !== revision) return;
  const locale = accent === "gb" ? "en-GB" : "en-US";
  const voices = speechSynthesis.getVoices().filter(v => v.lang.replace(/_/g, "-").toLowerCase() === locale.toLowerCase());
  const voice = voices.find(v => v.localService) || voices[0];
  if (!voice) throw new Error(`设备未安装${accent === "gb" ? "英式" : "美式"}英语语音；Android App 已内置两种语音`);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.lang = locale; utterance.rate = 0.9;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { if (ticket === revision) speechSynthesis.cancel(); reject(new Error("语音未能启动，请点击发音按钮重试")); }, 6000);
    utterance.onstart = () => { clearTimeout(timer); resolve(); };
    utterance.onerror = e => { clearTimeout(timer); if (e.error === "interrupted" || e.error === "canceled") resolve(); else reject(new Error("无法播放，请检查媒体音量和英语语音设置")); };
    speechSynthesis.speak(utterance);
  });
};
