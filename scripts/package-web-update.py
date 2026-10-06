"""Package web-only updates directly on the latest delivered v1.7 APK.

Native changes require a full Gradle build. This deliberately refuses them.
AXML layout: AOSP androidfw/ResourceTypes.h (ResStringPool, ResXMLTree).
The caller must zipalign, sign with the original key, and run verify-apk.py.
"""
import hashlib
from pathlib import Path
import re
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BASE_COMMIT = '7c163720f6fb9b5359a91ff93eea2f42e7a61f4f'
BASE_SHA256 = '0e8ea6e57f5db98b965e795d3b6d15df3d275612e8fa9100355b2b4139eacf0a'
BASE_VERSION_CODE = 8
BASE_VERSION_NAME = '1.7'

def patch_version(original, version_code, version_name):
    data = bytearray(original)
    u16 = lambda p: struct.unpack_from('<H', data, p)[0]
    u32 = lambda p: struct.unpack_from('<I', data, p)[0]
    assert u16(0) == 3 and u32(4) == len(data), 'Not a binary XML document'
    strings = []; offsets = []; changes = set()
    offset = u16(2)
    while offset < len(data):
        kind, header, size = struct.unpack_from('<HHI', data, offset)
        assert size >= header >= 8 and offset + size <= len(data)
        if kind == 1:
            count, _, flags, string_start, _ = struct.unpack_from('<5I', data, offset + 8)
            utf8 = bool(flags & 0x100)
            for i in range(count):
                p = offset + string_start + u32(offset + header + 4 * i)
                if utf8:
                    def length8(p):
                        first = data[p]
                        return (((first & 127) << 8) | data[p + 1], p + 2) if first & 128 else (first, p + 1)
                    _, p = length8(p); length, p = length8(p)
                    raw = bytes(data[p:p + length]); encoding = 'utf-8'
                else:
                    length = u16(p); p += 2
                    if length & 0x8000: length = ((length & 0x7fff) << 16) | u16(p); p += 2
                    raw = bytes(data[p:p + length * 2]); encoding = 'utf-16le'
                strings.append(raw.decode(encoding)); offsets.append((p, len(raw), encoding))
        elif kind == 0x102:
            ext = offset + header
            if strings[u32(ext + 4)] == 'manifest':
                start, stride, count = struct.unpack_from('<HHH', data, ext + 8)
                for i in range(count):
                    p = ext + start + i * stride
                    name = strings[u32(p + 4)]
                    if name == 'versionCode':
                        assert data[p + 15] == 0x10 and u32(p + 16) == BASE_VERSION_CODE
                        struct.pack_into('<I', data, p + 16, version_code); changes.add('code')
                    elif name == 'versionName':
                        assert data[p + 15] == 3
                        index = u32(p + 16); assert strings[index] == BASE_VERSION_NAME
                        pos, length, encoding = offsets[index]
                        replacement = version_name.encode(encoding); assert len(replacement) == length, 'Version name length changed; use Gradle'
                        data[pos:pos + length] = replacement; changes.add('name')
        offset += size
    assert changes == {'code', 'name'} and len(data) == len(original)
    return bytes(data)

def main():
    base, output = map(Path, sys.argv[1:3])
    with base.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == BASE_SHA256, 'Wrong native baseline APK'
    native_paths = ['android/app/src', 'android/variables.gradle', 'android/build.gradle',
                    'android/settings.gradle', 'android/capacitor.settings.gradle', 'capacitor.config.ts']
    subprocess.run(['git', 'diff', '--exit-code', BASE_COMMIT, '--', *native_paths], cwd=ROOT, check=True)
    original_gradle = subprocess.check_output(['git', 'show', BASE_COMMIT + ':android/app/build.gradle'], cwd=ROOT, text=True)
    current_gradle = (ROOT / 'android/app/build.gradle').read_text()
    version_code = int(re.search(r'versionCode (\d+)', current_gradle)[1])
    version_name = re.search(r'versionName "([^"]+)"', current_gradle)[1]
    assert version_code > BASE_VERSION_CODE
    assert current_gradle.replace(f'versionCode {version_code}', f'versionCode {BASE_VERSION_CODE}').replace(f'versionName "{version_name}"', f'versionName "{BASE_VERSION_NAME}"') == original_gradle
    web = ROOT / 'dist-local'; assert (web / 'index.html').exists() and (web / 'dictionary/metadata.json').exists()
    assert (ROOT / 'node_modules/@capacitor/android/capacitor/src/main').is_dir()
    # A native dependency upgrade also needs Gradle, even when Java sources did not change.
    import json
    old_lock = json.loads(subprocess.check_output(['git', 'show', BASE_COMMIT + ':package-lock.json'], cwd=ROOT))
    new_lock = json.loads((ROOT / 'package-lock.json').read_text())
    for name in ['@capacitor/android', '@capacitor/core']:
        assert old_lock['packages']['node_modules/' + name] == new_lock['packages']['node_modules/' + name]
    output.parent.mkdir(parents=True, exist_ok=True)
    preserved = 0
    with zipfile.ZipFile(base) as source, zipfile.ZipFile(output, 'w') as target:
        for item in source.infolist():
            if item.filename.startswith('assets/public/') or re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))', item.filename, re.I):
                continue
            data = source.read(item)
            if item.filename == 'AndroidManifest.xml': data = patch_version(data, version_code, version_name)
            else: preserved += 1
            target.writestr(item, data)
        for path in sorted(web.rglob('*')):
            if path.is_file(): target.write(path, 'assets/public/' + path.relative_to(web).as_posix(), compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(base) as source, zipfile.ZipFile(output) as target:
        for item in source.infolist():
            if item.filename in target.namelist() and not item.filename.startswith('assets/public/') and item.filename != 'AndroidManifest.xml':
                assert source.read(item.filename) == target.read(item.filename), item.filename
    print(f'Packaged web-only update; {preserved} native resources retained byte-for-byte. Alignment and signing required.')

if __name__ == '__main__': main()
