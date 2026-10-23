#!/bin/sh
# rebuilds lib/den-variants.json: every den item's art fetched (into cache/
# too), decompiled by JPEXS (tools/ffdec, needs Java) and read for its
# variants. see tools/den-variants.js.
#
#   tools/den-variants.sh [work folder]      (default: a new temporary one)
set -e
cd "$(dirname "$(readlink -f "$0")")/.."
work=${1:-$(mktemp -d)}
node tools/den-variants.js fetch "$work"
java -jar tools/ffdec/ffdec-cli.jar -export script "$work/out" "$work/swf" > "$work/ffdec.log" 2>&1
node tools/den-variants.js index "$work"
