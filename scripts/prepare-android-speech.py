"""Build-time downloads only. Verify fixed upstream hashes before packaging."""
import hashlib, json, os, shutil, tarfile, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get('LEXIDAY_AUDIO_DOWNLOADS', ROOT / '.android-audio-downloads'))
ASSETS = ROOT / 'android/app/src/main/assets/speech'
AAR = ROOT / 'android/app/libs/sherpa-onnx-1.13.7.aar'
SOURCES = {
 'sherpa.aar': ('https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.7/sherpa-onnx-1.13.7.aar', 'c4ef49e309f24fcee5c106b8a279481aaecaabb078cd37b2cd6e9a62cc8a73c8'),
 'kokoro.tar.bz2': ('https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2', '4c3052abaa60943a341f193888cf6abd68787dae6ab8ae5c925a706caa247e4e'),
}
def digest(path):
 with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()
def valid():
 manifest = ASSETS / 'checksums.json'
 if not manifest.exists() or not AAR.exists() or digest(AAR) != SOURCES['sherpa.aar'][1]: return False
 return all((ASSETS / n).is_file() and digest(ASSETS / n) == h for n,h in json.loads(manifest.read_text()).items())
if valid(): print('Offline speech resources verified.')
else:
 CACHE.mkdir(parents=True, exist_ok=True)
 for name,(url,expected) in SOURCES.items():
  path=CACHE/name
  if not path.exists() or digest(path)!=expected:
   partial=path.with_suffix(path.suffix+'.part')
   with urllib.request.urlopen(url,timeout=180) as src,partial.open('wb') as dst: shutil.copyfileobj(src,dst)
   if digest(partial)!=expected: raise RuntimeError('Upstream checksum changed: '+name)
   partial.replace(path)
 AAR.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(CACHE/'sherpa.aar',AAR);ASSETS.mkdir(parents=True,exist_ok=True)
 with tarfile.open(CACHE/'kokoro.tar.bz2') as archive:
  for member in archive:
   relative=Path(member.name).relative_to('kokoro-int8-multi-lang-v1_0')
   if relative.is_absolute() or '..' in relative.parts: raise ValueError('Unsafe path')
   selected=relative.name in ('model.int8.onnx','voices.bin','tokens.txt','LICENSE') or relative.parts[:1]==('espeak-ng-data',)
   if not selected or not member.isfile(): continue
   dest=ASSETS/relative;dest.parent.mkdir(parents=True,exist_ok=True)
   with archive.extractfile(member) as src,dest.open('wb') as out:shutil.copyfileobj(src,out)
   assert dest.stat().st_size==member.size
 hashes={str(p.relative_to(ASSETS)):digest(p) for p in sorted(ASSETS.rglob('*')) if p.is_file() and p.name!='checksums.json'}
 (ASSETS/'checksums.json').write_text(json.dumps(hashes,indent=2));assert valid();print('Prepared',len(hashes),'speech assets.')
