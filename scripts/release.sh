#!/bin/bash
set -e

# Function to increment version (same as before)
increment_version() {
    local version=$1
    local major minor patch

    if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        major=${BASH_REMATCH[1]}
        minor=${BASH_REMATCH[2]}
        patch=${BASH_REMATCH[3]}
    else
        echo "Error: Current version not in semantic format"
        exit 1
    fi

    case $2 in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
    esac

    echo "$major.$minor.$patch"
}

# Parse flags
FLAG_COUNT=0
VERSION_TYPE=""
SKIP_CONFIRM=0

for flag in "$@"; do
    case $flag in
        --major|--minor|--patch)
            FLAG_COUNT=$((FLAG_COUNT + 1))
            VERSION_TYPE=${flag#--}
            ;;
        --yes)
            SKIP_CONFIRM=1
            ;;
        *)
            echo "Error: Unknown flag $flag"
            echo "Usage: ./release.sh [--major|--minor|--patch] [--yes]"
            exit 1
            ;;
    esac
done

if [ $FLAG_COUNT -ne 1 ]; then
    echo "Error: Exactly one version flag (--major, --minor, or --patch) must be provided"
    echo "Usage: ./release.sh [--major|--minor|--patch] [--yes]"
    exit 1
fi

# Function to cleanup on failure
cleanup() {
    echo "Error occurred. Rolling back changes..."
    
    # Clean up temporary files
    rm -f CHANGELOG.tmp CHANGELOG.new

    # If we created a temporary branch, remove it
    if git show-ref --quiet refs/heads/temp-release-v$VERSION; then
        git checkout main
        git branch -D temp-release-v$VERSION
    fi

    # If we created a tag but haven't pushed, remove it
    if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
        git tag -d "v$VERSION"
    fi

    echo "Rollback complete. Please check git status"
    exit 1
}

# Set up error trap
trap cleanup ERR

# Ensure we're on main branch and up to date
echo "Checking git status..."
if ! git diff-index --quiet HEAD --; then
    echo "Error: Working directory is not clean"
    exit 1
fi

git checkout main
git pull origin main || {
    echo "Error: Failed to pull latest changes from main"
    exit 1
}

# Verify dev branch exists and is up to date
git fetch origin dev || {
    echo "Error: Failed to fetch dev branch"
    exit 1
}

if ! git show-ref --verify refs/remotes/origin/dev >/dev/null; then
    echo "Error: dev branch does not exist"
    exit 1
fi

# Get current version
if [ -f VERSION ]; then
    CURRENT_VERSION=$(cat VERSION)
else
    CURRENT_VERSION=$(node -p "require('./deployment-manager/package.json').version")
fi

# Calculate new version
VERSION=$(increment_version $CURRENT_VERSION $VERSION_TYPE)

# Generate changelog updates
PREV_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$PREV_VERSION" ]; then
    echo "## [$VERSION] - $(date +%Y-%m-%d)" > CHANGELOG.tmp
    echo "" >> CHANGELOG.tmp
    
    # Group changes by type
    echo "### Added" >> CHANGELOG.tmp
    git log $PREV_VERSION..HEAD --pretty=format:"* %s" --reverse | grep -i "^feat" >> CHANGELOG.tmp || true
    echo "" >> CHANGELOG.tmp
    
    echo "### Fixed" >> CHANGELOG.tmp
    git log $PREV_VERSION..HEAD --pretty=format:"* %s" --reverse | grep -i "^fix" >> CHANGELOG.tmp || true
    echo "" >> CHANGELOG.tmp
    
    echo "### Security" >> CHANGELOG.tmp
    git log $PREV_VERSION..HEAD --pretty=format:"* %s" --reverse | grep -i "^security\|^deps" >> CHANGELOG.tmp || true
    echo "" >> CHANGELOG.tmp
fi

# Show changes and confirm
echo "Current version: $CURRENT_VERSION"
echo "New version: $VERSION"
echo ""
echo "Changes to be included:"
if [ -f CHANGELOG.tmp ]; then
    cat CHANGELOG.tmp
fi
echo ""

if [ $SKIP_CONFIRM -eq 0 ]; then
    read -p "Continue with release? (y/N) " confirm
    if [[ $confirm != [yY] ]]; then
        echo "Release cancelled"
        rm -f CHANGELOG.tmp
        exit 1
    fi
fi

echo "Starting release process..."

# Create temporary release branch
git checkout -b temp-release-v$VERSION

# Update version files
echo $VERSION > VERSION
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" deployment-manager/package.json
else
    sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" deployment-manager/package.json
fi

# Update CHANGELOG.md
if [ -f CHANGELOG.tmp ]; then
    cat CHANGELOG.tmp CHANGELOG.md > CHANGELOG.new
    mv CHANGELOG.new CHANGELOG.md
    rm CHANGELOG.tmp
fi

# Commit changes
git add VERSION deployment-manager/package.json CHANGELOG.md
git commit -m "chore: release version $VERSION"

# Try to merge to main
echo "Merging to main..."
git checkout main
if ! git merge --no-ff temp-release-v$VERSION -m "chore: merge release $VERSION"; then
    echo "Merge conflict detected. Rolling back..."
    git merge --abort
    cleanup
fi

# Create tag
echo "Creating release tag..."
if ! git tag -a "v$VERSION" -m "Release v$VERSION"; then
    echo "Failed to create tag"
    cleanup
fi

# Push changes to main
echo "Pushing to main..."
if ! git push origin main --tags; then
    echo "Failed to push to main"
    git tag -d "v$VERSION"
    cleanup
fi

# Update dev branch
echo "Updating dev branch..."
if ! git checkout dev; then
    echo "Failed to checkout dev branch"
    cleanup
fi

if ! git pull origin dev; then
    echo "Failed to pull latest dev changes"
    cleanup
fi

if ! git merge --no-ff main -m "chore: sync dev with main after release $VERSION"; then
    echo "Merge conflict detected in dev. Manual intervention required."
    echo "Please resolve conflicts in dev branch and push changes manually."
    exit 1
fi

if ! git push origin dev; then
    echo "Failed to push to dev"
    echo "Please push dev branch manually after resolving any issues"
    exit 1
fi

# Cleanup
git branch -D temp-release-v$VERSION

echo "Release v$VERSION completed successfully!"
echo "Don't forget to:"
echo "1. Create a GitHub release from the tag v$VERSION"
echo "2. Copy the relevant CHANGELOG.md section to the GitHub release notes" 