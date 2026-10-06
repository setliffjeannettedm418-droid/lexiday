package com.lexiday.app;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Save through Android's document picker without broad storage permission. */
@CapacitorPlugin(name = "NativeBackup")
public class NativeBackupPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("data") == null) {
            call.reject("没有可导出的数据");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "lexiday-backup.json"));
        startActivityForResult(call, intent, "savedDocument");
    }

    @ActivityCallback
    private void savedDocument(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
            if (out == null) throw new java.io.IOException("无法打开保存位置");
            out.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception e) {
            call.reject("无法保存备份：" + e.getMessage(), e);
        }
    }
}
