#!/bin/sh
# copy psat/ into a served tree with version stamps, then (re)start a static server on :8765
SRC=/home/user/yohan-ahn/psat
ROOT=/tmp/yohan-work/sg/www
rm -rf "$ROOT/psat"; mkdir -p "$ROOT/psat"
cp "$SRC"/*.js "$SRC"/*.css "$SRC"/*.png "$SRC"/*.webmanifest "$ROOT/psat/"
ln -sfn /home/user/yohan-ahn/fonts "$ROOT/fonts"  # the self-hosted faces, as on the site
sed "s/__V__/test/g" "$SRC/index.html" > "$ROOT/psat/index.html"
if ! curl -s -o /dev/null http://127.0.0.1:8765/psat/; then
  (cd "$ROOT" && nohup python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &)
  sleep 1
fi
curl -s -o /dev/null -w "served %{http_code}\n" http://127.0.0.1:8765/psat/
