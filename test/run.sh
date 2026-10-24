#!/usr/bin/env bash
# Тести чистої Java-частини (кодування, кінці рядків) на звичайній JVM.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=build/test
rm -rf "$OUT" && mkdir -p "$OUT"
javac -nowarn -encoding UTF-8 -d "$OUT" app/java/ua/kod/editor/Encodings.java test/EncodingsTest.java
java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -cp "$OUT" EncodingsTest
