package ua.kod.editor;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.DocumentsContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * «Знайти в папці» і «Замінити в папці»: обхід дерева документів у фоновому потоці.
 * Результати надсилаються порціями через {@link Sink}.
 */
final class Finder {
    private Finder() {}

    interface Sink { void emit(String json); }

    static final long MAX_SIZE = 4L * 1024 * 1024;
    static final int MAX_HITS_FILE = 300;
    static final int MAX_HITS_TOTAL = 5000;

    static final Set<String> BINARY_EXT = new HashSet<>(java.util.Arrays.asList(
        "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif", "heic", "psd", "pdf", "zip", "gz", "tgz", "7z", "rar",
        "xz", "bz2", "jar", "apk", "aab", "so", "a", "o", "class", "dex", "mp3", "mp4", "m4a", "ogg", "wav", "flac", "webm",
        "mkv", "avi", "mov", "woff", "woff2", "ttf", "otf", "eot", "exe", "dll", "bin", "dat", "db", "sqlite", "keystore",
        "jks", "p12", "pyc", "wasm"));

    /** Будує регулярний вираз за параметрами пошуку. */
    static Pattern pattern(JSONObject o) {
        String q = o.optString("q");
        boolean regex = o.optBoolean("regex");
        boolean cs = o.optBoolean("cs");
        boolean word = o.optBoolean("word");
        String body = regex ? q : Pattern.quote(q);
        if (word) body = "(?<![\\p{L}\\p{N}_])(?:" + body + ")(?![\\p{L}\\p{N}_])";
        int flags = 0;
        if (!cs) flags |= Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
        return Pattern.compile(body, flags);
    }

    static Pattern globs(String spec) {
        if (spec == null || spec.trim().isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (String g : spec.trim().split("[;,\\s]+")) {
            if (g.isEmpty()) continue;
            if (sb.length() > 0) sb.append('|');
            StringBuilder r = new StringBuilder();
            for (char ch : g.toCharArray()) {
                if (ch == '*') r.append("[^/]*");
                else if (ch == '?') r.append('.');
                else if ("\\.[]{}()+-^$|".indexOf(ch) >= 0) r.append('\\').append(ch);
                else r.append(ch);
            }
            sb.append(r);
        }
        if (sb.length() == 0) return null;
        return Pattern.compile("^(?:" + sb + ")$", Pattern.CASE_INSENSITIVE);
    }

    static Set<String> excludes(String spec) {
        Set<String> s = new HashSet<>();
        if (spec != null) for (String x : spec.split("[;,\\s]+")) if (!x.isEmpty()) s.add(x.toLowerCase(Locale.ROOT));
        return s;
    }

    static final class Job implements Runnable {
        final Context c;
        final Uri tree;
        final String startId, startPath;
        final JSONObject o;
        final Sink sink;
        final AtomicBoolean cancel;
        final boolean replace;

        Job(Context c, Uri tree, String startId, String startPath, JSONObject o, boolean replace, Sink sink, AtomicBoolean cancel) {
            this.c = c; this.tree = tree; this.startId = startId; this.startPath = startPath;
            this.o = o; this.replace = replace; this.sink = sink; this.cancel = cancel;
        }

        int scanned = 0, matchedFiles = 0, totalHits = 0, replacedFiles = 0, replacedCount = 0, errors = 0;
        long lastEmit = 0;
        JSONArray batch = new JSONArray();

        @Override
        public void run() {
            try {
                Pattern p = pattern(o);
                Pattern inc = globs(o.optString("include"));
                Set<String> exc = excludes(o.optString("exclude"));
                Set<String> only = null;
                if (replace && o.has("paths")) {
                    only = new HashSet<>();
                    JSONArray arr = o.getJSONArray("paths");
                    for (int i = 0; i < arr.length(); i++) only.add(arr.getString(i));
                }
                String rep = o.optString("rep");
                if (!o.optBoolean("regex")) rep = Matcher.quoteReplacement(rep);

                ArrayDeque<String[]> stack = new ArrayDeque<>();
                String root = startId == null || startId.isEmpty() ? Files.rootId(tree) : startId;
                stack.push(new String[]{root, startPath == null ? "" : startPath});
                while (!stack.isEmpty() && !cancel.get()) {
                    String[] d = stack.pop();
                    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, d[0]);
                    ArrayList<String[]> files = new ArrayList<>();
                    ArrayList<String[]> dirs = new ArrayList<>();
                    Cursor cur = null;
                    try {
                        cur = c.getContentResolver().query(children, Files.COLS, null, null, null);
                        while (cur != null && cur.moveToNext()) {
                            String id = cur.getString(0), name = cur.getString(1), mime = cur.getString(2);
                            long size = cur.isNull(3) ? -1 : cur.getLong(3);
                            String rel = d[1].isEmpty() ? name : d[1] + "/" + name;
                            if (Files.isDir(mime)) {
                                if (!exc.contains(name.toLowerCase(Locale.ROOT))) dirs.add(new String[]{id, rel});
                            } else {
                                if (size > MAX_SIZE) continue;
                                if (BINARY_EXT.contains(Files.ext(name))) continue;
                                if (inc != null && !inc.matcher(name).matches()) continue;
                                if (exc.contains(name.toLowerCase(Locale.ROOT))) continue;
                                if (only != null && !only.contains(rel)) continue;
                                files.add(new String[]{id, rel});
                            }
                        }
                    } catch (Exception e) {
                        errors++;
                    } finally {
                        if (cur != null) cur.close();
                    }
                    java.util.Collections.sort(files, Finder::byPath);
                    java.util.Collections.sort(dirs, Finder::byPathDesc);
                    for (String[] f : files) {
                        if (cancel.get()) break;
                        if (replace) replaceIn(f[0], f[1], p, rep); else searchIn(f[0], f[1], p);
                        if (!replace && totalHits >= MAX_HITS_TOTAL) { cancel.set(true); break; }
                    }
                    for (String[] dd : dirs) stack.push(dd);
                }
                JSONObject end = progress(true);
                end.put("limit", !replace && totalHits >= MAX_HITS_TOTAL);
                sink.emit(end.toString());
            } catch (Exception e) {
                JSONObject end = new JSONObject();
                try {
                    end.put("done", true);
                    end.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
                } catch (Exception ignored) {}
                sink.emit(end.toString());
            }
        }

        JSONObject progress(boolean done) throws Exception {
            JSONObject r = new JSONObject();
            r.put("done", done);
            r.put("scanned", scanned);
            r.put("matched", matchedFiles);
            r.put("hits", totalHits);
            r.put("errors", errors);
            r.put("replacedFiles", replacedFiles);
            r.put("replaced", replacedCount);
            r.put("cancelled", cancel.get() && totalHits < MAX_HITS_TOTAL);
            r.put("files", batch);
            batch = new JSONArray();
            lastEmit = SystemClock.uptimeMillis();
            return r;
        }

        void maybeEmit() throws Exception {
            if (SystemClock.uptimeMillis() - lastEmit > 250) sink.emit(progress(false).toString());
        }

        void searchIn(String id, String rel, Pattern p) throws Exception {
            Uri u = Files.docUri(tree, id);
            byte[] b;
            try {
                b = Files.readBytes(c, u, MAX_SIZE);
            } catch (Exception e) {
                errors++;
                return;
            }
            scanned++;
            Encodings.Text t = Encodings.read(b, b.length, "auto");
            if (t.binary) { maybeEmit(); return; }
            JSONArray hits = new JSONArray();
            int count = 0;
            String s = t.text;
            int line = 0, start = 0, n = s.length();
            while (start <= n) {
                int end = s.indexOf('\n', start);
                if (end < 0) end = n;
                String ln = s.substring(start, end);
                Matcher m = p.matcher(ln);
                int inLine = 0, first = -1, firstLen = 0;
                while (m.find()) {
                    if (first < 0) { first = m.start(); firstLen = m.end() - m.start(); }
                    inLine++;
                }
                if (inLine > 0) {
                    count += inLine;
                    if (hits.length() < MAX_HITS_FILE) {
                        JSONObject h = new JSONObject();
                        int from = Math.max(0, first - 60);
                        int to = Math.min(ln.length(), first + firstLen + 140);
                        h.put("line", line);
                        h.put("col", first);
                        h.put("len", firstLen);
                        h.put("n", inLine);
                        h.put("text", ln.substring(from, to));
                        h.put("off", from);
                        hits.put(h);
                    }
                }
                line++;
                start = end + 1;
                if (end == n) break;
            }
            if (count > 0) {
                matchedFiles++;
                totalHits += count;
                JSONObject f = new JSONObject();
                f.put("path", rel);
                f.put("id", id);
                f.put("uri", u.toString());
                f.put("count", count);
                f.put("hits", hits);
                batch.put(f);
            }
            maybeEmit();
        }

        void replaceIn(String id, String rel, Pattern p, String rep) throws Exception {
            Uri u = Files.docUri(tree, id);
            byte[] b;
            try {
                b = Files.readBytes(c, u, MAX_SIZE);
            } catch (Exception e) {
                errors++;
                return;
            }
            scanned++;
            Encodings.Text t = Encodings.read(b, b.length, "auto");
            if (t.binary) return;
            String[] lines = t.text.split("\n", -1);
            int count = 0;
            for (int i = 0; i < lines.length; i++) {
                Matcher m = p.matcher(lines[i]);
                if (!m.find()) continue;
                m.reset();
                StringBuffer sb = new StringBuffer();
                while (m.find()) {
                    m.appendReplacement(sb, rep);
                    count++;
                }
                m.appendTail(sb);
                lines[i] = sb.toString();
            }
            if (count == 0) return;
            StringBuilder out = new StringBuilder(t.text.length() + 64);
            for (int i = 0; i < lines.length; i++) {
                if (i > 0) out.append('\n');
                out.append(lines[i]);
            }
            try {
                Files.writeBytes(c, u, Encodings.write(out.toString(), t.enc, t.bom, t.eol));
                replacedFiles++;
                replacedCount += count;
                JSONObject f = new JSONObject();
                f.put("path", rel);
                f.put("uri", u.toString());
                f.put("count", count);
                batch.put(f);
            } catch (Exception e) {
                errors++;
            }
            maybeEmit();
        }
    }

    static int byPath(String[] a, String[] b) {
        return a[1].compareToIgnoreCase(b[1]);
    }

    static int byPathDesc(String[] a, String[] b) {
        return b[1].compareToIgnoreCase(a[1]);
    }
}
