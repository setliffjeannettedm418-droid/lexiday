package com.lexiday.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;
import org.json.JSONArray;

/** Own-account requests; keys never return to JavaScript or study backups. */
@CapacitorPlugin(name = "NativeReading")
public class NativeReadingPlugin extends Plugin {
    private static final String ALIAS = "lexiday-reading-api-key-v1";
    private final ExecutorService requests = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private final ConcurrentHashMap<String, HttpsURLConnection> connections = new ConcurrentHashMap<>();
    private final java.util.Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private final java.util.concurrent.atomic.AtomicLong epoch = new java.util.concurrent.atomic.AtomicLong();
    private SharedPreferences prefs() { return getContext().getSharedPreferences("reading-service", Context.MODE_PRIVATE); }
    private SecretKey secret() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
    }
    private String key() throws Exception {
        String encrypted = prefs().getString("encrypted", ""); if (encrypted.isEmpty()) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret(), new GCMParameterSpec(128, Base64.decode(prefs().getString("iv", ""), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    private boolean validModel(String model) { return "deepseek-flash".equals(model) || "deepseek-v4-pro".equals(model); }
    @PluginMethod public void status(PluginCall call) {
        try { JSObject result = new JSObject(); result.put("configured", !key().isEmpty()); result.put("model", prefs().getString("model", "deepseek-flash")); call.resolve(result); }
        catch (Exception e) { call.reject("无法读取生成密钥，请重新设置。"); }
    }
    @PluginMethod public void configure(PluginCall call) {
        try {
            String model = call.getString("model", "deepseek-flash"); if (!validModel(model)) throw new IllegalArgumentException();
            String value = call.getString("key", "").trim(); if (value.isEmpty()) value = key();
            if (!value.matches("[!-~]{12,512}")) { call.reject("请填写完整的 API 密钥。"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secret());
            String encrypted = Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!prefs().edit().putString("encrypted", encrypted).putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).putString("model", model).commit()) throw new java.io.IOException();
            call.resolve();
        } catch (Exception e) { call.reject("无法安全保存密钥，请检查设备存储后重试。"); }
    }
    @PluginMethod public void clear(PluginCall call) {
        epoch.incrementAndGet(); for (HttpsURLConnection c : connections.values()) c.disconnect();
        if (prefs().edit().clear().commit()) call.resolve(); else call.reject("无法清除密钥，请重试。");
    }
    @PluginMethod public void cancel(PluginCall call) {
        String id = call.getString("id", ""); if (id.length() <= 200) cancelled.add(id);
        HttpsURLConnection c = connections.get(id); if (c != null) c.disconnect(); call.resolve();
    }
    @PluginMethod public void generate(PluginCall call) {
        execute(call, false);
    }
    @PluginMethod public void generatePhoto(PluginCall call) {
        execute(call, true);
    }
    private boolean validPhotoPayload(JSONObject payload) {
        if (!"deepseek-flash".equals(payload.optString("model"))) return false;
        JSONArray messages = payload.optJSONArray("messages");
        if (messages == null || messages.length() != 2) return false;
        JSONObject system = messages.optJSONObject(0), user = messages.optJSONObject(1);
        if (system == null || user == null || !"system".equals(system.optString("role")) || !"user".equals(user.optString("role"))) return false;
        JSONArray content = user.optJSONArray("content");
        if (content == null || content.length() < 2 || content.length() > 4) return false;
        for (int i = 1; i < content.length(); i++) {
            JSONObject part = content.optJSONObject(i);
            if (part == null || !"image_url".equals(part.optString("type"))) return false;
            JSONObject image = part.optJSONObject("image_url");
            String url = image == null ? "" : image.optString("url");
            if (url.length() > 3000000 || !url.matches("data:image/jpeg;base64,[A-Za-z0-9+/]+=*")) return false;
        }
        return true;
    }
    private void execute(PluginCall call, boolean photo) {
        long startedEpoch = epoch.get();
        requests.execute(() -> {
            String id = call.getString("id", ""); HttpsURLConnection c = null; java.util.concurrent.ScheduledFuture<?> deadline = null;
            try {
                if (cancelled.contains(id) || startedEpoch != epoch.get()) { call.reject("已暂停生成。"); return; }
                String value = key(); if (value.isEmpty()) { call.reject("请先在设置中填写 API 密钥。"); return; }
                String body = call.getString("body", "");
                if (body.length() > (photo ? 9100000 : 300000)) { call.reject("请求内容过大，请减少本次内容。"); return; }
                JSONObject payload = new JSONObject(body);
                if (!validModel(payload.optString("model")) || payload.optInt("max_tokens") < 1 || payload.optInt("max_tokens") > (photo ? 24000 : 12000) || payload.optBoolean("stream") || (photo && !validPhotoPayload(payload))) { call.reject("请求格式无效，请重新选择照片或词汇。"); return; }
                // No arbitrary hosts, redirects, proxy or external script loading.
                c = (HttpsURLConnection) new URL("https://api.deepseek.com/chat/completions").openConnection();
                c.setInstanceFollowRedirects(false); c.setConnectTimeout(20000); c.setReadTimeout(180000);
                c.setRequestMethod("POST"); c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("Authorization", "Bearer " + value);
                connections.put(id, c); if (cancelled.contains(id) || startedEpoch != epoch.get()) { call.reject("已暂停生成。"); return; }
                HttpsURLConnection active = c; deadline = timer.schedule(active::disconnect, 240, TimeUnit.SECONDS);
                try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
                int status = c.getResponseCode();
                if (status != 200) { call.reject(status == 401 || status == 403 ? "API 密钥无效或无访问权限，请检查设置。" : status == 402 ? "AI 服务余额不足，请在官方平台检查账户。" : status == 429 ? "AI 服务请求过于频繁，请稍后手动重试。" : "AI 服务未完成请求，请稍后手动重试。"); return; }
                try (InputStream input = c.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = input.read(buffer)) != -1) { if (bytes.size() + count > 4000000) throw new java.io.IOException(); bytes.write(buffer, 0, count); }
                    JSObject result = new JSObject(); result.put("body", bytes.toString("UTF-8")); call.resolve(result);
                }
            } catch (Exception e) { call.reject(photo ? "照片识别网络失败、已取消或请求超时。本次未导入单词，请求可能已计费，请手动决定是否重试。" : "网络失败、已暂停或请求超时。已完成短文仍保留；本次请求可能已计费，请手动决定是否重试。"); }
            finally { if (deadline != null) deadline.cancel(false); connections.remove(id); cancelled.remove(id); if (c != null) c.disconnect(); }
        });
    }
    @Override protected void handleOnDestroy() { for (HttpsURLConnection c : connections.values()) c.disconnect(); requests.shutdownNow(); timer.shutdownNow(); super.handleOnDestroy(); }
}
