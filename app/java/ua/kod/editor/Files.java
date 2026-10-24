package ua.kod.editor;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Робота з файлами через Storage Access Framework: окремі документи (content://)
 * і дерево папки проєкту (tree URI). Жодних дозволів на сховище не потрібно.
 */
final class Files {
    private Files() {}

    static final long MAX_OPEN = 32L * 1024 * 1024;

    // ------------------------------------------------------------ типи

    static String ext(String name) {
        if (name == null) return "";
        int slash = name.lastIndexOf('/');
        int dot = name.lastIndexOf('.');
        if (dot <= slash + 0 || dot < 0) return "";
        return name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    static String mimeFor(String name) {
        String e = ext(name);
        switch (e) {
            case "html": case "htm": case "xhtml": return "text/html";
            case "css": return "text/css";
            case "js": case "mjs": case "cjs": return "text/javascript";
            case "json": case "map": case "webmanifest": return "application/json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "ico": return "image/x-icon";
            case "bmp": return "image/bmp";
            case "avif": return "image/avif";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "mp3": return "audio/mpeg";
            case "ogg": return "audio/ogg";
            case "wav": return "audio/wav";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "wasm": return "application/wasm";
            case "xml": return "text/xml";
            case "txt": case "md": case "markdown": case "log": case "csv": case "ini": case "cfg": case "conf":
                return "text/plain";
            case "pdf": return "application/pdf";
            default:
                String m = e.isEmpty() ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(e);
                return m != null ? m : "application/octet-stream";
        }
    }

    /**
     * MIME для створення документа. Деякі постачальники додають «правильне» розширення,
     * якщо воно не відповідає типу (script.py → script.py.txt), тому для невідомих
     * розширень беремо application/octet-stream — тоді назва лишається як є.
     */
    static String createMime(String name) {
        String e = ext(name);
        if (e.isEmpty()) return "application/octet-stream";
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(e);
        return m != null ? m : "application/octet-stream";
    }

    // ------------------------------------------------------------ окремі документи

    static byte[] readBytes(Context c, Uri uri, long max) throws IOException {
        ContentResolver cr = c.getContentResolver();
        InputStream in = cr.openInputStream(uri);
        if (in == null) throw new FileNotFoundException("Не вдалося відкрити");
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(64 * 1024);
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > max) throw new IOException("TOO_BIG");
                bo.write(buf, 0, n);
            }
            return bo.toByteArray();
        } finally {
            try { in.close(); } catch (IOException ignored) {}
        }
    }

    static void writeBytes(Context c, Uri uri, byte[] data) throws IOException {
        ContentResolver cr = c.getContentResolver();
        // "wt" обрізає файл; на деяких постачальниках "w" без "t" лишає хвіст старого вмісту.
        String[] modes = {"wt", "rwt", "w"};
        IOException last = null;
        for (String mode : modes) {
            OutputStream out = null;
            try {
                out = cr.openOutputStream(uri, mode);
                if (out == null) continue;
                out.write(data);
                out.flush();
                return;
            } catch (IllegalArgumentException | UnsupportedOperationException e) {
                last = new IOException(e.getMessage());
            } catch (SecurityException e) {
                throw new IOException("NO_ACCESS");
            } catch (FileNotFoundException e) {
                last = e;
            } finally {
                if (out != null) try { out.close(); } catch (IOException ignored) {}
            }
        }
        throw last != null ? last : new IOException("Не вдалося записати");
    }

    /** Назва, розмір, час зміни, чи можна записувати. */
    static JSONObject stat(Context c, Uri uri) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", false);
            o.put("uri", uri.toString());
            String name = null;
            long size = -1, mtime = -1;
            int writable = -1;
            Cursor cur = null;
            try {
                cur = c.getContentResolver().query(uri, null, null, null, null);
                if (cur != null && cur.moveToFirst()) {
                    int i = cur.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (i >= 0 && !cur.isNull(i)) name = cur.getString(i);
                    i = cur.getColumnIndex(OpenableColumns.SIZE);
                    if (i >= 0 && !cur.isNull(i)) size = cur.getLong(i);
                    i = cur.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
                    if (i >= 0 && !cur.isNull(i)) mtime = cur.getLong(i);
                    i = cur.getColumnIndex(DocumentsContract.Document.COLUMN_FLAGS);
                    if (i >= 0 && !cur.isNull(i))
                        writable = (cur.getInt(i) & DocumentsContract.Document.FLAG_SUPPORTS_WRITE) != 0 ? 1 : 0;
                    o.put("ok", true);
                }
            } catch (Exception ignored) {
            } finally {
                if (cur != null) cur.close();
            }
            if (name == null) {
                String p = uri.getLastPathSegment();
                if (p != null) {
                    int s = p.lastIndexOf('/');
                    name = s >= 0 ? p.substring(s + 1) : p;
                    int colon = name.lastIndexOf(':');
                    if (colon >= 0 && colon < name.length() - 1) name = name.substring(colon + 1);
                }
            }
            o.put("name", name != null ? name : "файл");
            o.put("size", size);
            o.put("mtime", mtime);
            o.put("writable", writable);
        } catch (Exception ignored) {}
        return o;
    }

    // ------------------------------------------------------------ дерево папки

    static String rootId(Uri tree) {
        return DocumentsContract.getTreeDocumentId(tree);
    }

    static Uri docUri(Uri tree, String docId) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, docId);
    }

    static final String[] COLS = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
    };

    static boolean isDir(String mime) {
        return DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);
    }

    /** Діти папки: [{id,name,dir,size,mtime}]. Папки першими, далі за назвою. */
    static JSONArray list(Context c, Uri tree, String parentId) throws Exception {
        if (parentId == null || parentId.isEmpty()) parentId = rootId(tree);
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        JSONArray arr = new JSONArray();
        Cursor cur = c.getContentResolver().query(children, COLS, null, null, null);
        if (cur == null) return arr;
        java.util.ArrayList<JSONObject> items = new java.util.ArrayList<>();
        try {
            while (cur.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", cur.getString(0));
                o.put("name", cur.getString(1));
                o.put("dir", isDir(cur.getString(2)));
                o.put("size", cur.isNull(3) ? -1 : cur.getLong(3));
                o.put("mtime", cur.isNull(4) ? -1 : cur.getLong(4));
                items.add(o);
            }
        } finally {
            cur.close();
        }
        java.util.Collections.sort(items, Files::compareItems);
        for (JSONObject o : items) arr.put(o);
        return arr;
    }

    static int compareItems(JSONObject a, JSONObject b) {
        boolean da = a.optBoolean("dir"), db = b.optBoolean("dir");
        if (da != db) return da ? -1 : 1;
        return a.optString("name").compareToIgnoreCase(b.optString("name"));
    }

    /** Пошук дитини за назвою. Повертає {id, mime} або null. */
    static String[] child(Context c, Uri tree, String parentId, String name) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        Cursor cur = null;
        try {
            cur = c.getContentResolver().query(children, COLS, null, null, null);
            if (cur == null) return null;
            String ci = null, cm = null;
            while (cur.moveToNext()) {
                String n = cur.getString(1);
                if (name.equals(n)) return new String[]{cur.getString(0), cur.getString(2)};
                if (ci == null && name.equalsIgnoreCase(n)) { ci = cur.getString(0); cm = cur.getString(2); }
            }
            return ci != null ? new String[]{ci, cm} : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (cur != null) cur.close();
        }
    }

    /** Шлях «a/b/c.txt» відносно кореня дерева → {id, mime} або null. */
    static String[] resolve(Context c, Uri tree, String rel) {
        String id = rootId(tree);
        String mime = DocumentsContract.Document.MIME_TYPE_DIR;
        if (rel == null) return new String[]{id, mime};
        java.util.ArrayList<String> stack = new java.util.ArrayList<>();
        for (String part : rel.split("/")) {
            if (part.isEmpty() || part.equals(".")) continue;
            if (part.equals("..")) { if (!stack.isEmpty()) stack.remove(stack.size() - 1); continue; }
            stack.add(part);
        }
        for (String part : stack) {
            String[] ch = child(c, tree, id, part);
            if (ch == null) return null;
            id = ch[0];
            mime = ch[1];
        }
        return new String[]{id, mime};
    }

    static JSONObject create(Context c, Uri tree, String parentId, String name, boolean dir) throws Exception {
        if (parentId == null || parentId.isEmpty()) parentId = rootId(tree);
        Uri parent = docUri(tree, parentId);
        String mime = dir ? DocumentsContract.Document.MIME_TYPE_DIR : createMime(name);
        Uri u = DocumentsContract.createDocument(c.getContentResolver(), parent, mime, name);
        if (u == null) throw new IOException("Не вдалося створити");
        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("id", DocumentsContract.getDocumentId(u));
        o.put("uri", u.toString());
        o.put("name", stat(c, u).optString("name", name));
        return o;
    }

    static JSONObject rename(Context c, Uri tree, String docId, String name) throws Exception {
        Uri u = DocumentsContract.renameDocument(c.getContentResolver(), docUri(tree, docId), name);
        if (u == null) u = docUri(tree, docId);
        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("id", DocumentsContract.getDocumentId(u));
        o.put("uri", u.toString());
        o.put("name", stat(c, u).optString("name", name));
        return o;
    }

    static boolean delete(Context c, Uri tree, String docId) throws Exception {
        return DocumentsContract.deleteDocument(c.getContentResolver(), docUri(tree, docId));
    }

    /** Людська назва дерева (назва кореневої папки). */
    static String treeName(Context c, Uri tree) {
        return stat(c, docUri(tree, rootId(tree))).optString("name", "Папка");
    }
}
