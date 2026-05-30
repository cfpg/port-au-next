#!/usr/bin/env bash
#
# Cut a Port-Au-Next release on main from CHANGELOG [Unreleased].
#
# Prerequisites:
#   - Merge dev into main yourself (merge commits are fine).
#   - Fill in CHANGELOG.md [Unreleased] before running.
#
# Usage: ./scripts/release.sh [--major|--minor|--patch] [--yes]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION_TYPE=""
SKIP_CONFIRM=0

for flag in "$@"; do
  case "$flag" in
    --major | --minor | --patch)
      if [ -n "$VERSION_TYPE" ]; then
        echo "Error: Specify only one of --major, --minor, or --patch"
        exit 1
      fi
      VERSION_TYPE="${flag#--}"
      ;;
    --yes)
      SKIP_CONFIRM=1
      ;;
    -h | --help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Error: Unknown flag: $flag"
      echo "Usage: ./scripts/release.sh [--major|--minor|--patch] [--yes]"
      exit 1
      ;;
  esac
done

if [ -z "$VERSION_TYPE" ]; then
  echo "Error: Exactly one of --major, --minor, or --patch is required"
  echo "Usage: ./scripts/release.sh [--major|--minor|--patch] [--yes]"
  exit 1
fi

increment_version() {
  local version=$1
  local bump=$2
  local major minor patch

  if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
  else
    echo "Error: Current version '$version' is not semver (X.Y.Z)"
    exit 1
  fi

  case "$bump" in
    major)
      echo "$((major + 1)).0.0"
      ;;
    minor)
      echo "${major}.$((minor + 1)).0"
      ;;
    patch)
      echo "${major}.${minor}.$((patch + 1))"
      ;;
    *)
      echo "Error: Invalid bump type: $bump"
      exit 1
      ;;
  esac
}

CURRENT_VERSION=""
if [ -f VERSION ]; then
  CURRENT_VERSION="$(tr -d '[:space:]' < VERSION)"
else
  CURRENT_VERSION="$(node -p "require('./deployment-manager/package.json').version")"
fi

VERSION="$(increment_version "$CURRENT_VERSION" "$VERSION_TYPE")"
RELEASE_DATE="$(date +%Y-%m-%d)"
TAG="v$VERSION"

START_SHA=""
CHANGELOG_BACKUP=""

cleanup() {
  echo "Error occurred. Rolling back local changes..."
  rm -f CHANGELOG.md.bak

  if [ -n "$START_SHA" ]; then
    git checkout main 2>/dev/null || true
    git reset --hard "$START_SHA" 2>/dev/null || true
  fi

  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
    git tag -d "$TAG" 2>/dev/null || true
  fi

  echo "Rollback complete. Run 'git status' to verify."
  exit 1
}

trap cleanup ERR

unreleased_has_content() {
  awk '
    BEGIN { in_unreleased = 0; found = 0 }
    /^## \[Unreleased\]/ { in_unreleased = 1; next }
    in_unreleased && /^## \[/ { exit }
    in_unreleased && /^[[:space:]]*-/ { found = 1 }
    END { exit found ? 0 : 1 }
  ' CHANGELOG.md
}

promote_changelog() {
  local version=$1
  local release_date=$2

  awk -v version="$version" -v release_date="$release_date" '
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
  ' CHANGELOG.md > CHANGELOG.md.promoted

  mv CHANGELOG.md.promoted CHANGELOG.md
}

update_version_files() {
  echo "$VERSION" > VERSION
  if [[ "${OSTYPE:-}" == darwin* ]]; then
    sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" deployment-manager/package.json
  else
    sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" deployment-manager/package.json
  fi
}

echo "Checking git status..."
if ! git diff-index --quiet HEAD --; then
  echo "Error: Working directory is not clean. Commit or stash changes first."
  exit 1
fi

if ! git show-ref --verify --quiet refs/heads/main; then
  echo "Error: main branch not found"
  exit 1
fi

git checkout main
git pull origin main || {
  echo "Error: Failed to pull origin main"
  exit 1
}

START_SHA="$(git rev-parse HEAD)"

git fetch origin dev 2>/dev/null || true
if git show-ref --verify --quiet refs/remotes/origin/dev; then
  BEHIND_DEV="$(git rev-list --count HEAD..origin/dev 2>/dev/null || echo 0)"
  if [ "${BEHIND_DEV:-0}" -gt 0 ]; then
    echo "Error: main is ${BEHIND_DEV} commit(s) behind origin/dev."
    echo "Merge dev into main first, then run this script again."
    exit 1
  fi
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Error: Tag $TAG already exists locally"
  exit 1
fi

if ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  echo "Error: CHANGELOG.md must contain a ## [Unreleased] section"
  exit 1
fi

if ! unreleased_has_content; then
  echo "Error: ## [Unreleased] has no bullet entries."
  echo "Add release notes under Added / Changed / Fixed before releasing."
  exit 1
fi

echo "Current version: $CURRENT_VERSION"
echo "New version:     $VERSION"
echo "Release date:    $RELEASE_DATE"
echo ""
echo "Preview of promoted changelog section:"
awk -v version="$VERSION" -v release_date="$RELEASE_DATE" '
  BEGIN { in_unreleased = 0; printing = 0 }
  /^## \[Unreleased\]/ {
    print "## [" version "] - " release_date
    in_unreleased = 1
    next
  }
  in_unreleased && /^## \[/ { exit }
  in_unreleased { print }
' CHANGELOG.md
echo ""

if [ "$SKIP_CONFIRM" -eq 0 ]; then
  read -r -p "Continue with release $VERSION on main? (y/N) " confirm
  if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo "Release cancelled"
    exit 0
  fi
fi

echo "Promoting CHANGELOG [Unreleased] → [$VERSION]..."
CHANGELOG_BACKUP="$(mktemp)"
cp CHANGELOG.md "$CHANGELOG_BACKUP"
promote_changelog "$VERSION" "$RELEASE_DATE"

echo "Updating version files..."
update_version_files

echo "Creating release commit on main..."
git add CHANGELOG.md VERSION deployment-manager/package.json
git commit -m "chore: release version $VERSION"

echo "Creating tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"

echo "Pushing main and tags..."
git push origin main --tags || {
  echo "Error: Failed to push origin main --tags"
  cleanup
}

echo "Syncing dev with main..."
git checkout dev
git pull origin dev || {
  echo "Error: Failed to pull origin dev"
  cleanup
}

if ! git merge main -m "chore: sync dev with main after release $VERSION"; then
  echo "Error: Failed to merge main into dev. Resolve conflicts manually."
  exit 1
fi

git push origin dev || {
  echo "Error: Failed to push origin dev"
  exit 1
}

git checkout main
rm -f "$CHANGELOG_BACKUP"

trap - ERR

echo ""
echo "Release $TAG completed successfully."
echo ""
echo "Next steps:"
echo "  1. Publish GitHub release: https://github.com/cfpg/port-au-next/releases/new?tag=$TAG"
echo "  2. Or run: gh release create $TAG --title \"$TAG\" --notes-file <(awk '/^## \\[$VERSION\\]/,/^## \\[/ { if (/^## \\[/ && !/^## \\[$VERSION\\]/) exit; print }' CHANGELOG.md)"
echo "  3. Rebuild/restart deployment-manager from $TAG when deploying."
