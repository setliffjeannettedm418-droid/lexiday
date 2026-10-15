"""Inspect an APK against the exact offline web build; run after android:sync/build."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
apk = Path(sys.argv[1] if len(sys.argv) > 1 else root / 'android/app/build/outputs/apk/debug/app-debug.apk')
sdk = Path(os.environ['ANDROID_SDK_ROOT'])
build_tools = sdk / 'build-tools/36.0.0'
aapt = build_tools / ('aapt.exe' if os.name == 'nt' else 'aapt')
apksigner = build_tools / ('apksigner.bat' if os.name == 'nt' else 'apksigner')
badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
permissions = subprocess.check_output([str(aapt), 'dump', 'permissions', str(apk)], text=True, encoding='utf-8')
signature = subprocess.check_output([str(apksigner), 'verify', '--verbose', str(apk)], text=True, encoding='utf-8')
gradle = (root / 'android/app/build.gradle').read_text(encoding='utf-8')
version_code = re.search(r'versionCode (\d+)', gradle)[1]
version_name = re.search(r'versionName "([^"]+)"', gradle)[1]
assert "name='com.lexiday.app'" in badging
assert f"versionCode='{version_code}'" in badging and f"versionName='{version_name}'" in badging
assert "sdkVersion:'24'" in badging
assert "application-label:'词序'" in badging
assert 'android.permission.INTERNET' in permissions
assert 'android.permission.MANAGE_EXTERNAL_STORAGE' not in permissions
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signature
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None, 'APK ZIP CRC integrity check failed'
    hashes = json.loads(archive.read('assets/speech/checksums.json'))
    assert len(hashes) >= 350
    for name, expected in hashes.items():
        assert hashlib.sha256(archive.read('assets/speech/' + name)).hexdigest() == expected, name
    assert len(archive.read('assets/speech/model.int8.onnx')) == 114203756
    for abi in ('arm64-v8a', 'armeabi-v7a'):
        for lib in ('libonnxruntime.so', 'libsherpa-onnx-jni.so'):
            assert 'lib/' + abi + '/' + lib in archive.namelist()
    config = json.loads(archive.read('assets/capacitor.config.json'))
    assert not config.get('server', {}).get('url'), 'APK must not load a remote site'
    assets = [p for p in (root / 'dist-local').rglob('*') if p.is_file()]
    for path in assets:
        name = 'assets/public/' + path.relative_to(root / 'dist-local').as_posix()
        assert archive.read(name) == path.read_bytes(), f'Stale or missing resource: {name}'
    js = b''.join(archive.read(n) for n in archive.namelist() if n.startswith('assets/public/assets/') and n.endswith('.js'))
    seed = json.loads((root / 'src/db/seed.json').read_text(encoding='utf-8'))
    assert len(seed) == 153
    for word in seed:
        assert word['word'].encode() in js, word['word']
print(json.dumps({'apk': apk.name, 'size_bytes': apk.stat().st_size, 'bundled_assets_verified': len(assets), 'seed_words': len(seed), 'network_permission': True, 'signature_v2': True, 'zip_crc': True, 'minimum_android': '7.0', 'version': version_name, 'speech_assets_verified': len(hashes), 'result': 'passed'}, ensure_ascii=False, indent=2))
