"""Package a pinned, offline ECDICT subset in small lazy-loaded shards."""
import csv, hashlib, json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMMIT = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b'
SHA256 = '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf'
URL = f'https://raw.githubusercontent.com/skywind3000/ECDICT/{COMMIT}/ecdict.csv'
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.dictionary-downloads/ecdict.csv'
if not source.exists():
    source.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(URL, timeout=180) as response, source.open('wb') as out:
        import shutil
        shutil.copyfileobj(response, out)
with source.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == SHA256, 'Dictionary checksum changed'
shards = [{} for _ in range(256)]
for row in csv.DictReader(source.open(encoding='utf-8-sig', newline='')):
    word = row['word'].strip().lower()
    meaning = row['translation'].replace('\\n', '\n').strip()
    if not meaning or len(word) > 100 or not re.fullmatch(r"[a-z]+(?:[-'][a-z]+)*", word):
        continue
    bucket = 0
    for char in word:
        bucket = (bucket * 31 + ord(char)) & 255
    if word not in shards[bucket] or row['word'].strip() == word:
        shards[bucket][word] = [row['phonetic'], meaning, row['exchange']]
out = ROOT / 'public/dictionary'
out.mkdir(exist_ok=True)
hashes = {}
for index, shard in enumerate(shards):
    target = out / f'{index:02x}.json'
    target.write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':'), sort_keys=True), encoding='utf-8')
    hashes[target.name] = hashlib.sha256(target.read_bytes()).hexdigest()
metadata = {'source': 'https://github.com/skywind3000/ECDICT', 'commit': COMMIT,
            'source_sha256': SHA256, 'license': 'MIT', 'entries': sum(map(len, shards)),
            'scope': 'English single words, apostrophe and hyphen compounds with Chinese translations', 'shards': hashes}
(out / 'metadata.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
print(json.dumps({'entries': metadata['entries'], 'shards': len(shards), 'bytes': sum(p.stat().st_size for p in out.glob('*.json'))}))
