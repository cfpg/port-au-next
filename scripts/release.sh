#!/usr/bin/env bash
#
# Prepare a Port-Au-Next release from dev.
#
# Usage: ./scripts/release.sh X.Y.Z
#
# This script only updates release files. Review and commit the resulting diff,
# merge dev into main, and then create the tag and GitHub release separately.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: ./scripts/release.sh X.Y.Z"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$#" -ne 1 ]; then
  usage
  exit 1
fi

VERSION="$1"
RELEASE_DATE="$(date +%Y-%m-%d)"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must use semantic version format X.Y.Z"
  exit 1
fi

if [ "$(git branch --show-current)" != "dev" ]; then
  echo "Error: Release preparation must run from the dev branch"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working directory must be clean before preparing a release"
  exit 1
fi

for file in CHANGELOG.md VERSION deployment-manager/package.json deployment-manager/package-lock.json marketing-site/src/content/site.ts; do
  if [ ! -f "$file" ]; then
    echo "Error: Required release file is missing: $file"
    exit 1
  fi
done

CURRENT_VERSION="$(tr -d '[:space:]' < VERSION)"
if [ "$VERSION" = "$CURRENT_VERSION" ]; then
  echo "Error: Version is already $VERSION"
  exit 1
fi

if ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  echo "Error: CHANGELOG.md must contain a ## [Unreleased] section"
  exit 1
fi

if ! awk '
  BEGIN { in_unreleased = 0; found = 0 }
  /^## \[Unreleased\]/ { in_unreleased = 1; next }
  in_unreleased && /^## \[/ { exit }
  in_unreleased && /^[[:space:]]*-/ { found = 1 }
  END { exit found ? 0 : 1 }
' CHANGELOG.md; then
  echo "Error: CHANGELOG.md [Unreleased] has no release notes"
  exit 1
fi

if ! grep -Eq '^[[:space:]]*version: "[0-9]+\.[0-9]+\.[0-9]+",$' marketing-site/src/content/site.ts; then
  echo "Error: Could not find the marketing-site product version"
  exit 1
fi

echo "Preparing Port-Au-Next $CURRENT_VERSION -> $VERSION"

CHANGELOG_TEMP="$(mktemp)"
trap 'rm -f "$CHANGELOG_TEMP"' EXIT

awk -v version="$VERSION" -v release_date="$RELEASE_DATE" '
  BEGIN { in_unreleased = 0 }
  /^## \[Unreleased\]/ {
    print "## [Unreleased]"
    print ""
    print "### Added"
    print ""
    print "### Changed"
    print ""
    print "### Fixed"
    print ""
    print "## [" version "] - " release_date
    in_unreleased = 1
    next
  }
  in_unreleased && /^## \[/ {
    in_unreleased = 0
  }
  { print }
' CHANGELOG.md > "$CHANGELOG_TEMP"
mv "$CHANGELOG_TEMP" CHANGELOG.md

echo "$VERSION" > VERSION

(
  cd deployment-manager
  npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
)

if [[ "${OSTYPE:-}" == darwin* ]]; then
  sed -i '' -E "s|^([[:space:]]*)version: \"[0-9]+\.[0-9]+\.[0-9]+\",$|\1version: \"$VERSION\",|" marketing-site/src/content/site.ts
else
  sed -i -E "s|^([[:space:]]*)version: \"[0-9]+\.[0-9]+\.[0-9]+\",$|\1version: \"$VERSION\",|" marketing-site/src/content/site.ts
fi

echo
echo "Release files prepared. Review this diff:"
git diff -- CHANGELOG.md VERSION deployment-manager/package.json deployment-manager/package-lock.json marketing-site/src/content/site.ts

echo
echo "After review and validation:"
echo "  git add CHANGELOG.md VERSION deployment-manager/package.json deployment-manager/package-lock.json marketing-site/src/content/site.ts"
echo "  git commit -m \"chore: release version $VERSION\""
echo "  git push origin dev"
