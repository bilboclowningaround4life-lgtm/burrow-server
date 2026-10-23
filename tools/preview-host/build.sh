#!/bin/sh
# rebuilds public/item-preview.swf, the web item giver's den item preview
# (public/item-preview.html plays it with Ruffle): PreviewHost.as compiled by
# JPEXS (tools/ffdec, needs Java) into base.xml, a SWF of one frame holding
# only code. JPEXS can only compile a class over one already there, so
# base.xml has a PreviewHost (and an empty PreviewUnused, left from making it).
#
#   tools/preview-host/build.sh [output.swf]      (default: public/item-preview.swf)
set -e
cd "$(dirname "$(readlink -f "$0")")/../.."
out=${1:-public/item-preview.swf}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
ffdec="java -jar tools/ffdec/ffdec-cli.jar"
mkdir "$work/src"
cp tools/preview-host/PreviewHost.as "$work/src/"
$ffdec -xml2swf tools/preview-host/base.xml "$work/base.swf" > "$work/log" 2>&1
$ffdec -importScript "$work/base.swf" "$work/host.swf" "$work/src" >> "$work/log" 2>&1
$ffdec -abcclean "$work/host.swf" "$out" >> "$work/log" 2>&1 || { cat "$work/log"; exit 1; }
echo "$out: $(wc -c < "$out") bytes"
