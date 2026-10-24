
#!/bin/sh

if [ -z "$GITHUB_STEP_SUMMARY" ]; then
    GITHUB_STEP_SUMMARY="/dev/stdout"
fi

set -e

current=$(git rev-parse --abbrev-ref HEAD)
version=$(node -e "console.log(require('./package.json').version);")
dist="plugins/v$version"

echo "Publishing plugins: $current -> $dist (v$version)"

if [ "$1" = "--all-branches" ]; then
    rm -rf .dist .js
    git fetch --all

    # Process patch-1 last so its plugin builds take precedence.
    branches=$(
        git branch -r |
        sed 's/^[* ]*//' |
        grep -v '\->' |
        grep -v '/patch-1$' |
        sort || true
    )

    if git show-ref --verify --quiet refs/remotes/origin/patch-1; then
        branches="${branches}
origin/patch-1"
    fi

    for branch in $branches; do
        # Skip branches without the publishing script.
        if ! git cat-file -e "$branch:scripts/publish-plugins.sh" 2>/dev/null; then
            echo "Skipping $branch (publish script not present)"
            continue
        fi

        tmp_script=$(mktemp)
        git show "$branch:scripts/publish-plugins.sh" > "$tmp_script"

        if ! diff -q scripts/publish-plugins.sh "$tmp_script" >/dev/null 2>&1; then
            rm -f "$tmp_script"
            echo "Skipping $branch (script version mismatch)"
            continue
        fi
        rm -f "$tmp_script"

        echo "::group::Branch $branch"
        echo "Processing: $branch"

        git stash push -a -- .dist .js

        git checkout -f "$branch"

        if git stash list -1 | grep -q .; then
            git stash pop
        fi

        npm run clean:multisrc
        npm run build:multisrc

        echo "Compiling TypeScript..."
        npx tsc --project tsconfig.production.json

        echo "# $branch" >> "$GITHUB_STEP_SUMMARY"

        BRANCH="$dist" npm run build:manifest -- --only-new \
            2>> "$GITHUB_STEP_SUMMARY"

        if [ ! -d ".dist" ] || [ -z "$(ls -A .dist)" ]; then
            echo "ERROR: Manifest generation failed"
            exit 1
        fi

        echo "Done: $branch"
        echo "::endgroup::"
    done

    echo "::group::Publish All Branches"
    echo "Publishing combined plugins..."

    git checkout -f "$current"

    if git show-ref --verify --quiet "refs/heads/$dist"; then
        git branch -D "$dist"
    fi

    git checkout --orphan "$dist"
    git reset

    echo "Copying .js/plugins -> .js/src/plugins"
    mkdir -p .js/src

    if [ ! -d ".js/plugins" ]; then
        echo "ERROR: .js/plugins is missing"
        exit 1
    fi

    cp -r .js/plugins .js/src/plugins

    git add -f public/static .dist .js/src/plugins total.svg
    git commit -m "chore: Publish Plugins From All Branches"
    git push -f origin "$dist"

    git checkout -f "$current"

    echo "Published all branches to $dist"
    echo "::endgroup::"
    exit 0
fi

if git show-ref --verify --quiet "refs/heads/$dist"; then
    git branch -D "$dist"
fi

git checkout --orphan "$dist"
git reset
rm -rf .js

npm run clean:multisrc
npm run build:multisrc

echo "Compiling TypeScript..."
npx tsc --project tsconfig.production.json

npm run build:manifest

if [ ! -d ".dist" ] || [ -z "$(ls -A .dist)" ]; then
    echo "ERROR: Manifest generation failed"
    exit 1
fi

echo "Copying .js/plugins -> .js/src/plugins"
mkdir -p .js/src

if [ ! -d ".js/plugins" ]; then
    echo "ERROR: .js/plugins is missing"
    exit 1
fi

cp -r .js/plugins .js/src/plugins

git add -f public/static .dist .js/src/plugins total.svg
git commit -m "chore: Publish Plugins"
git push -f origin "$dist"

git checkout -f "$current"
echo "Published to $dist"
