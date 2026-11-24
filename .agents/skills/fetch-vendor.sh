#!/usr/bin/env bash
# Fetches the vendor skills that are too large to keep in git reviewably.
#
# capacitor-plugins ships 244 upstream reference pages (655 KB). Committed, it makes
# every review candidate exceed the native reviewer context budget, so it is fetched
# here at a pinned commit instead. Everything else lives in vendor/ and is versioned.
set -euo pipefail
REPO="capawesome-team/skills"
COMMIT="847d536"
DEST="$(dirname "$0")/vendor/capacitor-plugins"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone -q "https://github.com/$REPO" "$TMP/r"
git -C "$TMP/r" checkout -q "$COMMIT"
rm -rf "$DEST"
cp -r "$TMP/r/skills/capacitor-plugins" "$DEST"
echo "capacitor-plugins @ $COMMIT -> $DEST"
