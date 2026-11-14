#!/usr/bin/env bash
# Downloads the photos (hero image, logo, gallery) from the current villageeast.org site.
# Run this on your own computer: the old host blocks requests from cloud servers.
#
#   bash scripts/fetch-legacy-photos.sh
#
# Photos are saved to content/photos/legacy/ (originals, not deployed). Review them, then:
#   - copy your favourite wide photo to public/photos/hero.jpg and set
#     heroPhoto: '/photos/hero.jpg' in src/data/site.ts
#   - commit the folder so the new site can use them.
set -euo pipefail

SITE="https://villageeast.org"
OUT="$(cd "$(dirname "$0")/.." && pwd)/content/photos/legacy"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
PAGES=(home documents-2 financials newsletter vepoa-board meetings agendas%2Fminutes service-opportunities contact real-estate-documents archives)

mkdir -p "$OUT"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

for page in "${PAGES[@]}"; do
  echo "Reading $SITE/$page"
  curl -fsSL -A "$UA" "$SITE/$page" >> "$TMP/pages.html" || echo "  (skipped: could not load)"
done

# GoDaddy stores originals under img1.wsimg.com/isteam/ip/<site-id>/<file>; anything after "/:/"
# is a resize instruction, so strip it to get the full-size original.
grep -oE '(https?:)?//img1\.wsimg\.com/isteam/[^"'"'"' )\\]+' "$TMP/pages.html" \
  | sed -E 's#^(https?:)?//#https://#; s#/:/.*$##; s#\\u002[Ff]#/#g' \
  | grep -iE '\.(jpe?g|png|webp|gif)$' | sort -u > "$TMP/urls.txt" || true

count=$(wc -l < "$TMP/urls.txt" | tr -d ' ')
echo "Found $count images"
n=0
while IFS= read -r url; do
  n=$((n + 1))
  name="$(printf '%02d' "$n")-$(basename "$url" | sed -E 's/%20/-/g; s/[^A-Za-z0-9._-]+/-/g')"
  echo "  $name"
  curl -fsSL -A "$UA" -o "$OUT/$name" "$url" || echo "    failed: $url"
done < "$TMP/urls.txt"
echo "Saved to $OUT"
