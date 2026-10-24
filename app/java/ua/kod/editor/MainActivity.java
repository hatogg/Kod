package ua.kod.editor;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Єдиний екран: WebView з редактором (Ace) на віртуальному https-хості і JS-міст
 * {@code window.Android}. Усі слухачі — статичні вкладені класи або лямбди.
 */
public class MainActivity extends Activity {
    static final int REQ_OPEN = 31, REQ_FOLDER = 32, REQ_SAVE = 33, REQ_CHOOSER = 34;
    static final String MAIN_URL = Server.BASE + "/www/index.html";

    WebView web;
    boolean pageReady;
    String pendingIntent;
    String pickId;
    ValueCallback<Uri[]> chooserCb;
    WebView printView;
    final ExecutorService bg = Executors.newFixedThreadPool(2);
    final Map<String, AtomicBoolean> jobs = new ConcurrentHashMap<>();

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Window w = getWindow();
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        boolean night = isNight();
        int bg0 = night ? 0xFF16181D : 0xFFF6F7F9;
        w.setStatusBarColor(bg0);
        w.setNavigationBarColor(bg0);
        setLightBars(!night);

        web = new WebView(this);
        web.setBackgroundColor(bg0);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setSupportMultipleWindows(false);
        web.setWebViewClient(new Client(this));
        web.setWebChromeClient(new Chrome(this));
        web.addJavascriptInterface(new Bridge(this), "Android");
        WebView.setWebContentsDebuggingEnabled(getSharedPreferences("kod", MODE_PRIVATE).getBoolean("debug", false));

        handleIntent(getIntent());
        web.loadUrl(MAIN_URL);
    }

    boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    void setLightBars(boolean light) {
        View d = getWindow().getDecorView();
        int f = d.getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= 23) {
            f = light ? f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            f = light ? f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        d.setSystemUiVisibility(f);
    }

    void js(String code) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(code, null);
        });
    }

    // ------------------------------------------------------------ інтенти

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    void handleIntent(Intent in) {
        if (in == null) return;
        String action = in.getAction();
        try {
            JSONObject o = null;
            if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action)) {
                Uri u = in.getData();
                if (u != null) {
                    tryPersist(u, in.getFlags());
                    o = new JSONObject().put("type", "files").put("files", new JSONArray().put(fileJson(u)));
                }
            } else if (Intent.ACTION_SEND.equals(action)) {
                Uri u = in.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) {
                    o = new JSONObject().put("type", "files").put("files", new JSONArray().put(fileJson(u)));
                } else {
                    CharSequence t = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
                    if (t != null) {
                        o = new JSONObject().put("type", "text").put("text", t.toString());
                        String subj = in.getStringExtra(Intent.EXTRA_SUBJECT);
                        if (subj != null) o.put("title", subj);
                    }
                }
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> list = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null && !list.isEmpty()) {
                    JSONArray arr = new JSONArray();
                    for (Uri u : list) arr.put(fileJson(u));
                    o = new JSONObject().put("type", "files").put("files", arr);
                }
            }
            if (o != null) {
                pendingIntent = o.toString();
                if (pageReady) js("window.__kod&&__kod.onIntent()");
            }
        } catch (Exception ignored) {}
        setIntent(new Intent());
    }

    JSONObject fileJson(Uri u) throws Exception {
        JSONObject st = Files.stat(this, u);
        return new JSONObject().put("uri", u.toString()).put("name", st.optString("name"));
    }

    void tryPersist(Uri u, int flags) {
        int mode = flags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (mode == 0) mode = Intent.FLAG_GRANT_READ_URI_PERMISSION;
        try {
            getContentResolver().takePersistableUriPermission(u, mode);
        } catch (Exception e) {
            try {
                getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {}
        }
    }

    // ------------------------------------------------------------ вибір файлів

    void startPick(String id, String kind, String name) {
        pickId = id;
        Intent i;
        int req;
        if ("folder".equals(kind)) {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            req = REQ_FOLDER;
        } else if ("save".equals(kind)) {
            i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(Files.createMime(name));
            i.putExtra(Intent.EXTRA_TITLE, name);
            req = REQ_SAVE;
        } else {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            req = REQ_OPEN;
        }
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            startActivityForResult(i, req);
        } catch (Exception e) {
            deliverPick(fail("Немає застосунку для вибору файлів"));
        }
    }

    static String fail(String msg) {
        try {
            return new JSONObject().put("ok", false).put("err", msg).toString();
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    void deliverPick(String json) {
        String id = pickId;
        pickId = null;
        if (id == null) return;
        js("window.__kod&&__kod.onPick(" + JSONObject.quote(id) + "," + json + ")");
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_CHOOSER) {
            if (chooserCb != null) chooserCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            chooserCb = null;
            return;
        }
        if (res != RESULT_OK || data == null) {
            deliverPick("{\"ok\":false}");
            return;
        }
        int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            JSONObject o = new JSONObject().put("ok", true);
            if (req == REQ_OPEN) {
                JSONArray arr = new JSONArray();
                ClipData clip = data.getClipData();
                if (clip != null) {
                    for (int k = 0; k < clip.getItemCount(); k++) {
                        Uri u = clip.getItemAt(k).getUri();
                        if (u == null) continue;
                        tryPersist(u, flags);
                        arr.put(fileJson(u));
                    }
                } else if (data.getData() != null) {
                    tryPersist(data.getData(), flags);
                    arr.put(fileJson(data.getData()));
                }
                o.put("files", arr);
            } else if (req == REQ_FOLDER) {
                Uri u = data.getData();
                tryPersist(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                o.put("uri", u.toString()).put("name", Files.treeName(this, u));
            } else if (req == REQ_SAVE) {
                Uri u = data.getData();
                tryPersist(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                o.put("uri", u.toString()).put("name", Files.stat(this, u).optString("name"));
            }
            deliverPick(o.toString());
        } catch (Exception e) {
            deliverPick(fail(e.getMessage()));
        }
    }

    // ------------------------------------------------------------ життєвий цикл

    @Override
    protected void onPause() {
        super.onPause();
        js("window.__kod&&__kod.pause()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pageReady) js("window.__kod&&__kod.resume()");
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        js("window.__kod&&__kod.config(" + isNight() + ")");
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!pageReady) { super.onBackPressed(); return; }
        web.evaluateJavascript("window.__kod?__kod.back():'exit'", v -> {
            if ("\"exit\"".equals(v)) finish();
        });
    }

    @Override
    protected void onDestroy() {
        for (AtomicBoolean b : jobs.values()) b.set(true);
        bg.shutdownNow();
        if (web != null) {
            web.removeJavascriptInterface("Android");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ------------------------------------------------------------ WebView

    static class Client extends WebViewClient {
        final MainActivity a;
        Client(MainActivity a) { this.a = a; }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            return Server.handle(a, r.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (!r.isForMainFrame()) return false;
            if (Server.HOST.equals(u.getHost())) return false;
            try {
                a.startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (Exception ignored) {}
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
            if (url != null && url.startsWith(Server.BASE + "/www/")) {
                Bridge.handedOut = false;
                a.pageReady = false;
            }
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            if (url != null && url.startsWith(Server.BASE + "/www/")) {
                a.pageReady = true;
                if (a.pendingIntent != null) a.js("window.__kod&&__kod.onIntent()");
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
            // Рушій сторінки впав (брак пам'яті): перезапускаємо екран, сесію відновить сторінка.
            a.web = null;
            v.destroy();
            a.recreate();
            return true;
        }
    }

    static class Chrome extends WebChromeClient {
        final MainActivity a;
        Chrome(MainActivity a) { this.a = a; }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (a.chooserCb != null) a.chooserCb.onReceiveValue(null);
            a.chooserCb = cb;
            try {
                a.startActivityForResult(p.createIntent(), REQ_CHOOSER);
            } catch (Exception e) {
                a.chooserCb = null;
                return false;
            }
            return true;
        }
    }

    static class PrintClient extends WebViewClient {
        final MainActivity a;
        final String title;
        PrintClient(MainActivity a, String title) { this.a = a; this.title = title; }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            return Server.handle(a, r.getUrl());
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            PrintManager pm = (PrintManager) a.getSystemService(Context.PRINT_SERVICE);
            if (pm != null) pm.print(title, v.createPrintDocumentAdapter(title), new PrintAttributes.Builder().build());
        }
    }

    static class FindSink implements Finder.Sink {
        final MainActivity a;
        final String id;
        FindSink(MainActivity a, String id) { this.a = a; this.id = id; }

        @Override
        public void emit(String json) {
            a.js("window.__kod&&__kod.onFind(" + JSONObject.quote(id) + "," + json + ")");
            try {
                if (new JSONObject(json).optBoolean("done")) a.jobs.remove(id);
            } catch (Exception ignored) {}
        }
    }

    // ------------------------------------------------------------ JS-міст

    /**
     * Міст для сторінки редактора. Об'єкт WebView впроваджує в усі фрейми, тому кожен
     * виклик перевіряє маркер, який отримує лише головна сторінка (див. {@link #hello()}).
     * Сторінки перегляду працюють на іншому домені і маркера не знають.
     */
    public static class Bridge {
        final MainActivity a;
        static volatile boolean handedOut;
        static final String token = newToken();
        volatile String lastText;

        Bridge(MainActivity a) { this.a = a; }

        static String newToken() {
            byte[] b = new byte[18];
            new SecureRandom().nextBytes(b);
            StringBuilder sb = new StringBuilder();
            for (byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        }

        boolean ok(String t) { return token.equals(t); }

        @JavascriptInterface
        public synchronized String hello() {
            if (handedOut) return "";
            handedOut = true;
            return token;
        }

        @JavascriptInterface
        public String info(String t) {
            if (!ok(t)) return "{}";
            try {
                PackageInfo pi = a.getPackageManager().getPackageInfo(a.getPackageName(), 0);
                return new JSONObject()
                    .put("version", pi.versionName)
                    .put("sdk", Build.VERSION.SDK_INT)
                    .put("model", Build.MANUFACTURER + " " + Build.MODEL)
                    .put("night", a.isNight())
                    .put("debug", a.getSharedPreferences("kod", MODE_PRIVATE).getBoolean("debug", false))
                    .toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public String encodings(String t) {
            if (!ok(t)) return "[]";
            JSONArray arr = new JSONArray();
            for (String[] e : Encodings.SUPPORTED) arr.put(new JSONArray().put(e[0]).put(e[2]));
            return arr.toString();
        }

        @JavascriptInterface
        public void pick(String t, String id, String kind, String name) {
            if (!ok(t)) return;
            a.runOnUiThread(() -> a.startPick(id, kind, name));
        }

        /** Читає файл; текст забирається окремим викликом {@link #text}. */
        @JavascriptInterface
        public String read(String t, String uri, String enc) {
            if (!ok(t)) return "{}";
            JSONObject o = new JSONObject();
            try {
                Uri u = Uri.parse(uri);
                JSONObject st = Files.stat(a, u);
                byte[] b = Files.readBytes(a, u, Files.MAX_OPEN);
                Encodings.Text tx = Encodings.read(b, b.length, enc);
                lastText = tx.text;
                o.put("ok", true)
                    .put("name", st.optString("name"))
                    .put("size", b.length)
                    .put("mtime", st.optLong("mtime", -1))
                    .put("writable", st.optInt("writable", -1))
                    .put("enc", tx.enc)
                    .put("bom", tx.bom)
                    .put("eol", tx.eol)
                    .put("mixed", tx.mixed)
                    .put("binary", tx.binary);
            } catch (Exception e) {
                lastText = null;
                String m = e.getMessage();
                try {
                    o.put("ok", false).put("err", "TOO_BIG".equals(m) ? "big" : (e instanceof SecurityException ? "access" : (m == null ? e.toString() : m)));
                } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public String text(String t) {
            if (!ok(t)) return "";
            String s = lastText;
            lastText = null;
            return s == null ? "" : s;
        }

        @JavascriptInterface
        public String write(String t, String uri, String text, String enc, boolean bom, String eol) {
            if (!ok(t)) return "{}";
            JSONObject o = new JSONObject();
            try {
                Uri u = Uri.parse(uri);
                byte[] b = Encodings.write(text, enc, bom, eol);
                Files.writeBytes(a, u, b);
                JSONObject st = Files.stat(a, u);
                o.put("ok", true).put("size", b.length).put("mtime", st.optLong("mtime", -1));
            } catch (Exception e) {
                String m = e.getMessage();
                try {
                    o.put("ok", false).put("err", "NO_ACCESS".equals(m) || e instanceof SecurityException ? "access" : (m == null ? e.toString() : m));
                } catch (Exception ignored) {}
            }
            return o.toString();
        }

        @JavascriptInterface
        public int unmappable(String t, String text, String enc) {
            if (!ok(t)) return 0;
            return Encodings.unmappable(text, enc);
        }

        @JavascriptInterface
        public String stat(String t, String uri) {
            if (!ok(t)) return "{}";
            return Files.stat(a, Uri.parse(uri)).toString();
        }

        // ---------- папка проєкту

        @JavascriptInterface
        public String list(String t, String tree, String id) {
            if (!ok(t)) return "{}";
            try {
                return new JSONObject().put("ok", true).put("items", Files.list(a, Uri.parse(tree), id)).toString();
            } catch (Exception e) {
                return fail(e instanceof SecurityException ? "access" : String.valueOf(e.getMessage()));
            }
        }

        @JavascriptInterface
        public String docUri(String t, String tree, String id) {
            if (!ok(t)) return "";
            return Files.docUri(Uri.parse(tree), id).toString();
        }

        @JavascriptInterface
        public String rootId(String t, String tree) {
            if (!ok(t)) return "";
            try {
                return Files.rootId(Uri.parse(tree));
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String create(String t, String tree, String parent, String name, boolean dir) {
            if (!ok(t)) return "{}";
            try {
                return Files.create(a, Uri.parse(tree), parent, name, dir).toString();
            } catch (Exception e) {
                return fail(String.valueOf(e.getMessage()));
            }
        }

        @JavascriptInterface
        public String rename(String t, String tree, String id, String name) {
            if (!ok(t)) return "{}";
            try {
                return Files.rename(a, Uri.parse(tree), id, name).toString();
            } catch (Exception e) {
                return fail(String.valueOf(e.getMessage()));
            }
        }

        @JavascriptInterface
        public String remove(String t, String tree, String id) {
            if (!ok(t)) return "{}";
            try {
                return new JSONObject().put("ok", Files.delete(a, Uri.parse(tree), id)).toString();
            } catch (Exception e) {
                return fail(String.valueOf(e.getMessage()));
            }
        }

        @JavascriptInterface
        public String resolve(String t, String tree, String rel) {
            if (!ok(t)) return "{}";
            try {
                Uri tr = Uri.parse(tree);
                String[] r = Files.resolve(a, tr, rel);
                if (r == null) return fail("not found");
                return new JSONObject().put("ok", true).put("id", r[0]).put("dir", Files.isDir(r[1]))
                    .put("uri", Files.docUri(tr, r[0]).toString()).toString();
            } catch (Exception e) {
                return fail(String.valueOf(e.getMessage()));
            }
        }

        @JavascriptInterface
        public String treeName(String t, String tree) {
            if (!ok(t)) return "";
            try {
                return Files.treeName(a, Uri.parse(tree));
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void find(String t, String id, String tree, String startId, String startPath, String opts, boolean replace) {
            if (!ok(t)) return;
            try {
                AtomicBoolean cancel = new AtomicBoolean(false);
                a.jobs.put(id, cancel);
                a.bg.execute(new Finder.Job(a.getApplicationContext(), Uri.parse(tree), startId, startPath,
                    new JSONObject(opts), replace, new FindSink(a, id), cancel));
            } catch (Exception e) {
                a.js("window.__kod&&__kod.onFind(" + JSONObject.quote(id) + ",{done:true,error:" + JSONObject.quote(String.valueOf(e.getMessage())) + "})");
            }
        }

        @JavascriptInterface
        public void cancel(String t, String id) {
            if (!ok(t)) return;
            AtomicBoolean b = a.jobs.get(id);
            if (b != null) b.set(true);
        }

        // ---------- внутрішнє сховище

        @JavascriptInterface
        public boolean kvPut(String t, String key, String value) {
            return ok(t) && Store.put(a, "kv", key, value);
        }

        @JavascriptInterface
        public String kvGet(String t, String key) {
            if (!ok(t)) return null;
            return Store.get(a, "kv", key);
        }

        @JavascriptInterface
        public boolean backupPut(String t, String id, String text) {
            return ok(t) && Store.put(a, "backup", id, text);
        }

        @JavascriptInterface
        public String backupGet(String t, String id) {
            if (!ok(t)) return null;
            return Store.get(a, "backup", id);
        }

        @JavascriptInterface
        public void backupDel(String t, String id) {
            if (ok(t)) Store.del(a, "backup", id);
        }

        @JavascriptInterface
        public String backupKeys(String t) {
            if (!ok(t)) return "[]";
            JSONArray arr = new JSONArray();
            for (String k : Store.keys(a, "backup")) if (!k.endsWith(".tmp")) arr.put(k);
            return arr.toString();
        }

        // ---------- буфер обміну, поширення, зовнішні застосунки

        @JavascriptInterface
        public String clipGet(String t) {
            if (!ok(t)) return "";
            final String[] out = {""};
            final Object lock = new Object();
            final boolean[] done = {false};
            a.runOnUiThread(() -> {
                try {
                    ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip().getItemCount() > 0) {
                        CharSequence cs = cm.getPrimaryClip().getItemAt(0).coerceToText(a);
                        if (cs != null) out[0] = cs.toString();
                    }
                } catch (Exception ignored) {}
                synchronized (lock) { done[0] = true; lock.notifyAll(); }
            });
            synchronized (lock) {
                long until = System.currentTimeMillis() + 1500;
                while (!done[0] && System.currentTimeMillis() < until) {
                    try { lock.wait(100); } catch (InterruptedException e) { break; }
                }
            }
            return out[0];
        }

        @JavascriptInterface
        public void clipSet(String t, String text) {
            if (!ok(t)) return;
            a.runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Код", text));
            });
        }

        @JavascriptInterface
        public void share(String t, String text, String name) {
            if (!ok(t)) return;
            a.runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    if (name != null && !name.isEmpty()) {
                        File dir = new File(a.getCacheDir(), "share");
                        dir.mkdirs();
                        File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                        try (FileOutputStream out = new FileOutputStream(f)) {
                            out.write(text.getBytes("UTF-8"));
                        }
                        Uri u = FileShareProvider.uriFor(a, f);
                        String m = Files.mimeFor(name);
                        i.setType(m.startsWith("application/octet") ? "text/plain" : m);
                        i.putExtra(Intent.EXTRA_STREAM, u);
                        i.setClipData(ClipData.newRawUri(name, u));
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } else {
                        i.setType("text/plain");
                        i.putExtra(Intent.EXTRA_TEXT, text);
                    }
                    a.startActivity(Intent.createChooser(i, "Поділитися"));
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void view(String t, String url, String mime) {
            if (!ok(t)) return;
            a.runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    Uri u = Uri.parse(url);
                    if (mime != null && !mime.isEmpty()) i.setDataAndType(u, mime); else i.setData(u);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (ContentResolver.SCHEME_CONTENT.equals(u.getScheme())) a.startActivity(Intent.createChooser(i, "Відкрити в…"));
                    else a.startActivity(i);
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public String hash(String t, String text, String algo) {
            if (!ok(t)) return "";
            try {
                MessageDigest md = MessageDigest.getInstance(algo);
                byte[] d = md.digest(text.getBytes("UTF-8"));
                StringBuilder sb = new StringBuilder();
                for (byte x : d) sb.append(String.format("%02x", x));
                return sb.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void print(String t, String html, String title) {
            if (!ok(t)) return;
            a.runOnUiThread(() -> {
                WebView pv = new WebView(a);
                pv.getSettings().setJavaScriptEnabled(false);
                pv.setWebViewClient(new PrintClient(a, title));
                pv.loadDataWithBaseURL(Server.BASE + "/www/", html, "text/html", "utf-8", null);
                a.printView = pv;
            });
        }

        // ---------- перегляд

        @JavascriptInterface
        public void previewSet(String t, String json) {
            if (!ok(t)) return;
            try {
                JSONObject o = new JSONObject(json);
                Server.Preview p = new Server.Preview();
                String tree = o.optString("tree");
                p.tree = tree.isEmpty() ? null : Uri.parse(tree);
                JSONObject files = o.optJSONObject("files");
                if (files != null) {
                    Iterator<String> it = files.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        p.overrides.put(Server.normalize(k), files.getString(k));
                    }
                }
                Server.preview = p;
            } catch (Exception ignored) {}
        }

        // ---------- різне

        @JavascriptInterface
        public String intent(String t) {
            if (!ok(t)) return "";
            String s = a.pendingIntent;
            a.pendingIntent = null;
            return s == null ? "" : s;
        }

        @JavascriptInterface
        public void bars(String t, String color, boolean light) {
            if (!ok(t)) return;
            a.runOnUiThread(() -> {
                try {
                    int c = Color.parseColor(color);
                    a.getWindow().setStatusBarColor(c);
                    a.getWindow().setNavigationBarColor(c);
                    if (a.web != null) a.web.setBackgroundColor(c);
                    a.setLightBars(light);
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void debug(String t, boolean on) {
            if (!ok(t)) return;
            a.getSharedPreferences("kod", MODE_PRIVATE).edit().putBoolean("debug", on).apply();
            a.runOnUiThread(() -> WebView.setWebContentsDebuggingEnabled(on));
        }

        @JavascriptInterface
        public String persisted(String t) {
            if (!ok(t)) return "[]";
            JSONArray arr = new JSONArray();
            for (UriPermission p : a.getContentResolver().getPersistedUriPermissions()) arr.put(p.getUri().toString());
            return arr.toString();
        }

        @JavascriptInterface
        public void release(String t, String uri) {
            if (!ok(t)) return;
            try {
                a.getContentResolver().releasePersistableUriPermission(Uri.parse(uri),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception e) {
                try {
                    a.getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void exit(String t) {
            if (!ok(t)) return;
            a.runOnUiThread(a::finish);
        }
    }
}
