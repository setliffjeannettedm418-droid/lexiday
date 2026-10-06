import { useRef, useState, useEffect } from "react";
import { LoaderCircle, Volume2 } from "lucide-react";
import type { Accent, Speak } from "../features/audio/speech";
export function PronunciationButtons({ word, speak }: { word: string; speak: Speak }) {
  const [pending, setPending] = useState<Accent | null>(null);
  const request = useRef(0);
  useEffect(() => { request.current++; setPending(null); return () => { request.current++; }; }, [word]);
  async function play(accent: Accent) {
    const id = ++request.current; setPending(accent);
    try { await speak(word, accent); } finally { if (request.current === id) setPending(null); }
  }
  return <div className="pronunciation-buttons" role="group" aria-label="单词发音">
    {([['us', '美式'], ['gb', '英式']] as const).map(([accent, label]) =>
      <button key={accent} type="button" aria-label={`播放${label}发音`} aria-busy={pending === accent} onClick={() => void play(accent)}>
        {pending === accent ? <LoaderCircle size={16} className="audio-loading" /> : <Volume2 size={16} />}{label}
      </button>)}
  </div>;
}
