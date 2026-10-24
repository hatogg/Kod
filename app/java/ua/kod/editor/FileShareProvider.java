package ua.kod.editor;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Мінімальний постачальник файлів із кешу застосунку для «Поділитися файлом». */
public class FileShareProvider extends ContentProvider {
    static final String AUTHORITY = "ua.kod.editor.files";

    public static Uri uriFor(Context c, File f) {
        String rel = c.getCacheDir().toURI().relativize(f.toURI()).getPath();
        return new Uri.Builder().scheme("content").authority(AUTHORITY).encodedPath("/" + Uri.encode(rel, "/")).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        Context c = getContext();
        if (c == null) throw new FileNotFoundException("no context");
        File base = c.getCacheDir();
        String p = uri.getPath();
        if (p == null) throw new FileNotFoundException("no path");
        File f = new File(base, p);
        try {
            String cb = base.getCanonicalPath();
            String cf = f.getCanonicalPath();
            if (!cf.startsWith(cb + File.separator)) throw new FileNotFoundException("denied");
        } catch (IOException e) {
            throw new FileNotFoundException("bad path");
        }
        return f;
    }

    @Override
    public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (mode.contains("w")) {
            File parent = f.getParentFile();
            if (parent != null) parent.mkdirs();
        }
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public String getType(Uri uri) {
        String p = uri.getPath();
        if (p == null) return "application/octet-stream";
        String m = Files.mimeFor(p);
        return m.startsWith("application/octet") ? "text/plain" : m;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        int n = 0;
        String[] outCols = new String[cols.length];
        Object[] vals = new Object[cols.length];
        for (String col : cols) {
            if (OpenableColumns.DISPLAY_NAME.equals(col)) { outCols[n] = col; vals[n++] = f.getName(); }
            else if (OpenableColumns.SIZE.equals(col)) { outCols[n] = col; vals[n++] = f.length(); }
        }
        String[] c2 = new String[n];
        Object[] v2 = new Object[n];
        System.arraycopy(outCols, 0, c2, 0, n);
        System.arraycopy(vals, 0, v2, 0, n);
        MatrixCursor mc = new MatrixCursor(c2, 1);
        mc.addRow(v2);
        return mc;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) { return null; }

    @Override
    public int delete(Uri uri, String selection, String[] args) { return 0; }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
}
