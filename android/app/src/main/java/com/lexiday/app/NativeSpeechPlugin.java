package com.lexiday.app;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** Bundled neural speech; never requires Web Speech, a system engine or HTTP. */
@CapacitorPlugin(name = "NativeSpeech")
public class NativeSpeechPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicLong revision = new AtomicLong();
    private final Object playerLock = new Object();
    private MediaPlayer player;
    private OfflineTts engine;
    private File modelDir;

    @PluginMethod public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        String accent = call.getString("accent", "us");
        if (text.isEmpty() || text.length() > 300 || !(accent.equals("us") || accent.equals("gb"))) {
            call.reject("请选择单词和正确的发音类型"); return;
        }
        long ticket = revision.incrementAndGet(); stopPlayer();
        worker.execute(() -> {
            try {
                if (ticket != revision.get()) { call.resolve(); return; }
                File wav = audioFile(text, accent);
                if (!wav.exists() || wav.length() < 100) {
                    ensureEngine();
                    if (ticket != revision.get()) { call.resolve(); return; }
                    generate(text, accent, wav);
                }
                synchronized (playerLock) {
                    if (ticket != revision.get()) { call.resolve(); return; }
                    MediaPlayer next = new MediaPlayer(); player = next;
                    next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                    next.setDataSource(wav.getAbsolutePath());
                    next.setOnCompletionListener(this::releasePlayer);
                    next.setOnErrorListener((p, what, extra) -> { releasePlayer(p); return true; });
                    next.prepare(); next.start();
                }
                wav.setLastModified(System.currentTimeMillis()); call.resolve();
                File[] files = wav.getParentFile().listFiles((d, name) -> name.endsWith(".wav"));
                if (files != null && files.length > 200) {
                    Arrays.sort(files, Comparator.comparingLong(File::lastModified));
                    for (int i = 0; i < files.length - 200; i++) files[i].delete();
                }
            } catch (Exception | LinkageError e) {
                stopPlayer();
                android.util.Log.e("LexidaySpeech", "Playback failed", e);
                if (ticket == revision.get()) call.reject("离线发音暂时无法播放，请重新打开应用并检查媒体音量"); else call.resolve();
            }
        });
    }
    @PluginMethod public void prepare(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty() || text.length() > 300) { call.resolve(); return; }
        long ticket = revision.get();
        worker.execute(() -> {
            try {
                if (ticket != revision.get()) { call.resolve(); return; }
                File wav = audioFile(text, "us");
                if (!wav.exists() || wav.length() < 100) {
                    ensureEngine();
                    if (ticket == revision.get()) generate(text, "us", wav);
                }
                call.resolve();
            } catch (Exception | LinkageError e) { call.reject("预备发音失败"); }
        });
    }
    private File audioFile(String text, String accent) throws Exception {
        File cache = new File(getContext().getCacheDir(), "pronunciation-v1");
        if (!cache.exists() && !cache.mkdirs()) throw new IOException("无法创建缓存");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest((accent + ":" + text).getBytes(StandardCharsets.UTF_8));
        StringBuilder hash = new StringBuilder();
        for (byte b : digest) hash.append(String.format("%02x", b));
        return new File(cache, hash + ".wav");
    }
    private void generate(String text, String accent, File wav) throws IOException {
        GenerationConfig generation = new GenerationConfig();
        // Official speaker map: 3=American af_heart, 21=British bf_emma.
        generation.setSid(accent.equals("gb") ? 21 : 3); generation.setSpeed(0.9f);
        // eSpeak identifies British English as "en", not "en-gb".
        generation.setExtra(Collections.singletonMap("lang", accent.equals("gb") ? "en" : "en-us"));
        GeneratedAudio audio = engine.generateWithConfig(text, generation);
        if (audio.getSamples().length < 100) throw new IOException("未生成有效语音");
        File tmp = new File(wav.getParentFile(), wav.getName() + ".tmp");
        if (!audio.save(tmp.getAbsolutePath()) || !tmp.renameTo(wav)) { tmp.delete(); throw new IOException("无法保存语音"); }
    }
    private void ensureEngine() throws IOException {
        if (modelDir == null) {
            File directory = new File(getContext().getFilesDir(), "offline-voice-v1");
            File ready = new File(directory, "ready");
            if (!ready.exists()) {
                copyAssets("speech", directory);
                try (FileOutputStream out = new FileOutputStream(ready)) { out.write(1); }
            }
            modelDir = directory;
        }
        if (engine != null) return;
        OfflineTtsKokoroModelConfig kokoro = new OfflineTtsKokoroModelConfig();
        kokoro.setModel(new File(modelDir, "model.int8.onnx").getAbsolutePath());
        kokoro.setVoices(new File(modelDir, "voices.bin").getAbsolutePath());
        kokoro.setTokens(new File(modelDir, "tokens.txt").getAbsolutePath());
        kokoro.setDataDir(new File(modelDir, "espeak-ng-data").getAbsolutePath()); kokoro.setLang("en-us");
        OfflineTtsModelConfig model = new OfflineTtsModelConfig(); model.setKokoro(kokoro); model.setNumThreads(2);
        OfflineTtsConfig config = new OfflineTtsConfig(); config.setModel(model); engine = new OfflineTts(null, config);
    }
    private void copyAssets(String from, File to) throws IOException {
        String[] children = getContext().getAssets().list(from);
        if (children != null && children.length > 0) {
            if (!to.exists() && !to.mkdirs()) throw new IOException("语音存储空间不足");
            for (String child : children) copyAssets(from + "/" + child, new File(to, child));
        } else {
            try (InputStream in = getContext().getAssets().open(from); OutputStream out = new FileOutputStream(to)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            }
        }
    }
    private void releasePlayer(MediaPlayer p) { synchronized (playerLock) { if (player == p) { player = null; p.release(); } } }
    private void stopPlayer() { synchronized (playerLock) { if (player != null) { player.release(); player = null; } } }
    @PluginMethod public void stop(PluginCall call) { revision.incrementAndGet(); stopPlayer(); call.resolve(); }
    @Override protected void handleOnPause() { revision.incrementAndGet(); stopPlayer(); }
    @Override protected void handleOnDestroy() {
        revision.incrementAndGet(); stopPlayer();
        worker.execute(() -> { if (engine != null) { engine.release(); engine = null; } }); worker.shutdown();
    }
}
