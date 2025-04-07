#!/bin/bash
set -e

# Function to increment version
increment_version() {
    local version=$1
    local major minor patch

    if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        major=${BASH_REMATCH[1]}
        minor=${BASH_REMATCH[2]}
        patch=${BASH_REMATCH[3]}
    else
        echo "Error: Current version '$version' not in semantic format (X.Y.Z)"
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
        *)
            echo "Error: Invalid version type '$2'. Must be major, minor, or patch"
            exit 1
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

# Fast-forward main to dev to ensure all features are included
echo "Fast-forwarding main to dev..."
if ! git merge origin/dev --ff-only; then
    echo "Error: Cannot fast-forward main to dev. This usually means main has diverged from dev."
    echo "Please ensure main does not have commits that aren't in dev before releasing."
    git merge --abort
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

# Enhanced commit message parsing function
parse_commit_messages() {
    local type=$1
    local pattern=""
    case $type in
        "feat")
            pattern="^feat|^feature|^add"
            ;;
        "fix")
            pattern="^fix|^bug|^hotfix"
            ;;
        "security")
            pattern="^security|^deps|^dependency"
            ;;
        "chore")
            pattern="^chore"
            ;;
    esac
    
    git log $PREV_VERSION..HEAD --pretty=format:"* %s" --reverse | \
        grep -iE "$pattern" | \
        sed -E 's/^([^:]*): */\1: /' | \
        sed -E 's/^([^\(]*)(\([^\)]*\))?:? */\1/' || true
}

# Improved changelog generation
generate_changelog() {
    echo "## [$VERSION] - $(date +%Y-%m-%d)" > CHANGELOG.tmp
    echo "" >> CHANGELOG.tmp
    
    # Group changes by type with improved parsing
    echo "### Added" >> CHANGELOG.tmp
    parse_commit_messages "feat" >> CHANGELOG.tmp
    echo "" >> CHANGELOG.tmp
    
    echo "### Fixed" >> CHANGELOG.tmp
    parse_commit_messages "fix" >> CHANGELOG.tmp
    echo "" >> CHANGELOG.tmp
    
    echo "### Security" >> CHANGELOG.tmp
    parse_commit_messages "security" >> CHANGELOG.tmp
    echo "" >> CHANGELOG.tmp

    echo "### Changed" >> CHANGELOG.tmp
    parse_commit_messages "chore" >> CHANGELOG.tmp
    echo "" >> CHANGELOG.tmp
}

# Get previous version and generate changelog
PREV_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$PREV_VERSION" ]; then
    generate_changelog
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

# Main release process
echo "Starting release process..."

# Create temporary release branch
RELEASE_BRANCH="release-v$VERSION"
if git show-ref --verify --quiet "refs/heads/$RELEASE_BRANCH"; then
    echo "Error: Release branch $RELEASE_BRANCH already exists"
    exit 1
fi

git checkout -b "$RELEASE_BRANCH"

# Update version files
echo "Updating version files..."
echo $VERSION > VERSION
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" deployment-manager/package.json
else
    sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" deployment-manager/package.json
fi

# Update CHANGELOG.md
echo "Updating changelog..."
if [ -f CHANGELOG.tmp ]; then
    cat CHANGELOG.tmp CHANGELOG.md > CHANGELOG.new
    mv CHANGELOG.new CHANGELOG.md
    rm CHANGELOG.tmp
fi

# Commit changes
echo "Committing version changes..."
git add VERSION deployment-manager/package.json CHANGELOG.md
git commit -m "chore: release version $VERSION"

# Enhanced merge handling
handle_merge() {
    local source=$1
    local target=$2
    local message=$3
    
    echo "Attempting to merge $source into $target..."
    
    if ! git checkout $target; then
        echo "Error: Failed to checkout $target branch"
        return 1
    fi
    
    if ! git pull origin $target; then
        echo "Error: Failed to update $target branch"
        return 1
    fi
    
    if ! git merge --no-ff $source -m "$message"; then
        echo "Merge conflict detected while merging $source into $target"
        echo "Options:"
        echo "1. Abort merge and exit"
        echo "2. Open merge tool to resolve conflicts"
        read -p "Choose option (1/2): " merge_option
        
        case $merge_option in
            1)
                git merge --abort
                echo "Merge aborted"
                return 1
                ;;
            2)
                echo "Please resolve conflicts in your preferred editor"
                echo "After resolving, save files and press any key to continue"
                read -n 1
                
                # Check if conflicts were resolved
                if ! git diff --check; then
                    echo "Error: Conflicts still exist"
                    git merge --abort
                    return 1
                fi
                
                git add .
                git commit --no-edit
                return 0
                ;;
            *)
                git merge --abort
                echo "Error: Invalid option"
                return 1
                ;;
        esac
    fi
    
    echo "Successfully merged $source into $target"
    return 0
}

# Merge to main
echo "Merging to main..."
if ! handle_merge "$RELEASE_BRANCH" main "chore: merge release $VERSION"; then
    cleanup
fi

# Create and push tag
echo "Creating release tag..."
if ! git tag -a "v$VERSION" -m "Release v$VERSION"; then
    echo "Error: Failed to create tag"
    cleanup
fi

echo "Pushing to main..."
if ! git push origin main --tags; then
    echo "Error: Failed to push to main"
    git tag -d "v$VERSION"
    cleanup
fi

# Update dev branch
echo "Updating dev branch..."
if ! handle_merge main dev "chore: sync dev with main after release $VERSION"; then
    echo "Error: Failed to merge main into dev"
    echo "Please resolve conflicts manually and push changes"
    exit 1
fi

# Cleanup
echo "Cleaning up..."
git branch -D "$RELEASE_BRANCH"

echo "Release v$VERSION completed successfully!"
echo "Don't forget to:"
echo "1. Create a GitHub release from the tag v$VERSION"
echo "2. Copy the relevant CHANGELOG.md section to the GitHub release notes" 