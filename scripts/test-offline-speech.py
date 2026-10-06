"""Synthesize both accents using the exact staged Android model (pip install sherpa-onnx==1.13.7 soundfile)."""
import json, os, time, tempfile
from pathlib import Path
import numpy as np
import sherpa_onnx, soundfile
root=Path(__file__).resolve().parent.parent
model=root/'android/app/src/main/assets/speech'
out=Path(os.environ.get('LEXIDAY_TEST_OUTPUT', tempfile.mkdtemp(prefix='lexiday-audio-')));out.mkdir(exist_ok=True)
config=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=str(model/'model.int8.onnx'),voices=str(model/'voices.bin'),tokens=str(model/'tokens.txt'),data_dir=str(model/'espeak-ng-data'),lang='en-us'),num_threads=2))
engine=sherpa_onnx.OfflineTts(config)
results=[]
for accent,sid,lang in [('us',3,'en-us'),('gb',21,'en')]:
 for word in ['significant','material','schedule','tomato']:
  g=sherpa_onnx.GenerationConfig();g.sid=sid;g.speed=.9;g.extra={'lang':lang}
  begin=time.monotonic();audio=engine.generate(word,config=g)
  assert audio.sample_rate==24000 and len(audio.samples)>1000 and np.abs(audio.samples).max()>.01
  soundfile.write(out/f'{word}-{accent}.wav',audio.samples,audio.sample_rate)
  item={'word':word,'accent':accent,'samples':len(audio.samples),'seconds':round(time.monotonic()-begin,2)}
  results.append(item);print(json.dumps(item),flush=True)
(out/'results.json').write_text(json.dumps(results,indent=2))
