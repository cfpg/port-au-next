#!/usr/bin/env bash
#
# Prepare and publish a Port-Au-Next release from dev.
#
# Usage: ./scripts/release.sh X.Y.Z
#
# The script pauses before committing release files to dev and again before
# merging, tagging, and pushing main. GitHub release publication stays manual.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: ./scripts/release.sh X.Y.Z"
}

confirm() {
  local prompt="$1"
  local answer

  if ! read -r -p "$prompt [y/N] " answer; then
    return 1
  fi

  [[ "$answer" =~ ^[yY]$ ]]
}

print_publish_steps() {
  echo "To publish the prepared release manually:"
  echo "  git checkout main"
  echo "  git pull --ff-only origin main"
  echo "  git merge --no-ff origin/dev -m \"chore: merge dev for release $VERSION\""
  echo "  git tag -a $TAG -m \"Release $TAG\""
  echo "  git push --atomic origin main $TAG"
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
TAG="v$VERSION"

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

echo "Fetching release branches..."
git fetch origin --prune

if [ "$(git rev-parse dev)" != "$(git rev-parse origin/dev)" ]; then
  echo "Error: Local dev must match origin/dev before preparing a release"
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null ||
   git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Error: Tag $TAG already exists"
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
git --no-pager diff --color=always -- CHANGELOG.md VERSION deployment-manager/package.json deployment-manager/package-lock.json marketing-site/src/content/site.ts

echo
if ! confirm "Commit these release files and push them to origin/dev?"; then
  echo "Release preparation stopped. The generated file changes were left in place."
  exit 0
fi

git add CHANGELOG.md VERSION deployment-manager/package.json deployment-manager/package-lock.json marketing-site/src/content/site.ts
git commit -m "chore: release version $VERSION"
git push origin dev

RELEASE_COMMIT="$(git rev-parse HEAD)"

echo
echo "Preparing the main merge..."
git fetch origin --prune

if [ "$(git rev-parse origin/dev)" != "$RELEASE_COMMIT" ]; then
  echo "Error: origin/dev changed after the release commit was created"
  print_publish_steps
  exit 1
fi

git checkout main
git pull --ff-only origin main

echo
echo "Commits included in this release:"
git --no-pager log --oneline --decorate HEAD..origin/dev

if ! git merge --no-ff --no-commit origin/dev; then
  echo "Error: dev could not be merged into main cleanly"
  git merge --abort >/dev/null 2>&1 || true
  git checkout dev
  print_publish_steps
  exit 1
fi

if [ ! -f "$(git rev-parse --git-path MERGE_HEAD)" ]; then
  echo "Error: The release produced no merge commit"
  git checkout dev
  exit 1
fi

echo
echo "Proposed main merge diff:"
git --no-pager diff --cached --color=always

echo
if ! confirm "Commit this merge, tag $TAG, and atomically push main with the tag?"; then
  git merge --abort
  git checkout dev
  echo "Publishing stopped. origin/main and $TAG were not changed."
  print_publish_steps
  exit 0
fi

git commit -m "chore: merge dev for release $VERSION"
git tag -a "$TAG" -m "Release $TAG"

if ! git push --atomic origin main "$TAG"; then
  echo "Error: Atomic push failed. Local main and $TAG were left in place for inspection."
  echo "Retry with: git push --atomic origin main $TAG"
  exit 1
fi

echo
echo "Release $TAG was pushed successfully."
echo "Publish the GitHub release with:"
echo "  gh release create $TAG --title \"$TAG\" --generate-notes"
