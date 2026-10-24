package ua.kod.editor;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Віртуальні сайти всередині WebView (запити не виходять у мережу):
 *   https://appassets.androidplatform.net/www/…  — інтерфейс застосунку з assets/www;
 *   https://preview.appassets.androidplatform.net/… — сторінки, які користувач запускає
 *     з редактора: спершу вміст відкритих вкладок (навіть незбережений), потім файли
 *     папки проєкту. Окремий домен не дає сторінкам перегляду доступу до редактора.
 */
final class Server {
    private Server() {}

    static final String HOST = "appassets.androidplatform.net";
    static final String BASE = "https://" + HOST;
    static final String PREVIEW_HOST = "preview." + HOST;

    /** Стан перегляду, який задає сторінка перед запуском. */
    static final class Preview {
        Uri tree;                                   // папка проєкту або null
        final Map<String, String> overrides = new HashMap<>(); // відносний шлях → текст
        final Map<String, String[]> cache = new HashMap<>();   // шлях → {id, mime}
    }

    static volatile Preview preview = new Preview();

    static WebResourceResponse handle(Context c, Uri url) {
        if (url == null) return null;
        String host = url.getHost();
        String path = url.getPath();
        if (path == null) path = "/";
        try {
            if (HOST.equals(host)) {
                if (path.equals("/")) path = "/www/index.html";
                if (path.startsWith("/www/")) return asset(c.getAssets(), path.substring(1));
                return text(404, "Not found", "text/plain", "404: " + path);
            }
            if (PREVIEW_HOST.equals(host)) {
                if (path.equals("/__kod/hook.js")) return asset(c.getAssets(), "www/js/hook.js");
                return previewFile(c, path.substring(1));
            }
        } catch (Exception e) {
            return text(404, "Not found", "text/plain", "404: " + path);
        }
        return null;
    }

    static WebResourceResponse asset(AssetManager am, String path) throws Exception {
        InputStream in;
        try {
            in = am.open(path, AssetManager.ACCESS_STREAMING);
        } catch (Exception e) {
            return text(404, "Not found", "text/plain", "404: " + path);
        }
        WebResourceResponse r = new WebResourceResponse(Files.mimeFor(path), "utf-8", in);
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        h.put("Access-Control-Allow-Origin", "*");
        r.setResponseHeaders(h);
        return r;
    }

    static WebResourceResponse previewFile(Context c, String rel) throws Exception {
        rel = normalize(rel);
        Preview p = preview;
        String body = p.overrides.get(rel);
        if (body == null && (rel.isEmpty() || rel.endsWith("/"))) {
            body = p.overrides.get(rel + "index.html");
            if (body != null) rel = rel + "index.html";
        }
        String mime = Files.mimeFor(rel);
        if (body != null) {
            if (mime.equals("text/html")) body = inject(body);
            return text(200, "OK", mime, body);
        }
        if (p.tree == null) return text(404, "Not found", "text/plain", "Файл не знайдено: " + rel);

        String[] doc;
        synchronized (p.cache) { doc = p.cache.get(rel); }
        if (doc == null) {
            doc = Files.resolve(c, p.tree, rel);
            if (doc != null && Files.isDir(doc[1])) {
                rel = rel.isEmpty() || rel.endsWith("/") ? rel + "index.html" : rel + "/index.html";
                doc = Files.resolve(c, p.tree, rel);
                mime = Files.mimeFor(rel);
            }
            if (doc == null) return text(404, "Not found", "text/plain", "Файл не знайдено: " + rel);
            synchronized (p.cache) { p.cache.put(rel, doc); }
        }
        Uri u = Files.docUri(p.tree, doc[0]);
        if (mime.equals("text/html")) {
            byte[] b = Files.readBytes(c, u, Files.MAX_OPEN);
            Encodings.Text t = Encodings.read(b, b.length, "auto");
            return text(200, "OK", mime, inject(t.text));
        }
        InputStream in = c.getContentResolver().openInputStream(u);
        WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "utf-8" : null, in);
        r.setResponseHeaders(noStore());
        return r;
    }

    static String normalize(String rel) {
        rel = Uri.decode(rel);
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        boolean dir = rel.endsWith("/");
        for (String part : rel.split("/")) {
            if (part.isEmpty() || part.equals(".")) continue;
            if (part.equals("..")) { if (!out.isEmpty()) out.remove(out.size() - 1); continue; }
            out.add(part);
        }
        String s = android.text.TextUtils.join("/", out);
        return dir && !s.isEmpty() ? s + "/" : s;
    }

    static final Pattern HEAD = Pattern.compile("<head[^>]*>", Pattern.CASE_INSENSITIVE);
    static final String HOOK = "<script src=\"/__kod/hook.js\"></script>";

    /** Додає до сторінки перехоплювач консолі, щоб показувати її вивід у редакторі. */
    static String inject(String html) {
        Matcher m = HEAD.matcher(html);
        if (m.find()) return html.substring(0, m.end()) + HOOK + html.substring(m.end());
        int doctype = html.toLowerCase().indexOf("<!doctype");
        if (doctype >= 0) {
            int end = html.indexOf('>', doctype);
            if (end > 0) return html.substring(0, end + 1) + HOOK + html.substring(end + 1);
        }
        return HOOK + html;
    }

    static Map<String, String> noStore() {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        h.put("Access-Control-Allow-Origin", "*");
        return h;
    }

    static WebResourceResponse text(int code, String reason, String mime, String body) {
        WebResourceResponse r = new WebResourceResponse(mime, "utf-8", code, reason, noStore(),
            new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        return r;
    }
}
