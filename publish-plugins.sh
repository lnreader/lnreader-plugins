#!/bin/bash

if [ -z "$GITHUB_STEP_SUMMARY" ]; then
    GITHUB_STEP_SUMMARY="/dev/stdout"
fi

current=`git rev-parse --abbrev-ref HEAD`
version=`node -e "console.log(require('./package.json').version);"`
dist="plugins/v$version"

if [[ "$1" == "--all-branches" ]]; then
    rm -rf .dist .js
    git fetch --all
    branches=$(git branch -r | grep -v '\->')
    for branch in $branches; do
        # Check if the branch has the same version of publish-plugins.sh as the current branch
        if ! diff publish-plugins.sh <(git show "$branch:publish-plugins.sh") >/dev/null; then
            echo "Branch $branch does not have the current version of publish-plugins.sh. Skipping."
            continue
        fi
        echo "::group::Branch $branch"
        git stash push -a -- .dist .js
        git checkout -f $branch
        exists=`git show-ref refs/heads/$dist`
        if [ -n "$exists" ]; then
            git branch -D $dist
        fi
        git stash pop
        npm run clean:multisrc
        npm run build:multisrc
        npx tsc --project tsconfig.production.json
        echo "# $branch" >> $GITHUB_STEP_SUMMARY
        npm run build:manifest -- --only-new 2>> $GITHUB_STEP_SUMMARY
        if [ ! -d ".dist" ] || [ -z "$(ls -A .dist)" ]; then
            echo "=========="
            echo "JSON files were not generated! See the error above and fix it!"
        fi
        echo "::endgroup::"
    done
    echo
    echo "::group::Publish All Branches"
    git checkout --orphan $dist
    if [ $? -eq 1 ]; then
        # If checkout failed
        echo "=========="
        echo "Could not checkout branch dist! See the error above and fix it!"
        echo "::endgroup::"
        exit 1
    fi
    git reset
    git add -f public/static .dist .js/src/plugins total.svg
    git commit -m "chore: Publish Plugins From All Branches"
    git push -f origin $dist
    git checkout -f $branch
    echo "::endgroup::"
    exit 0
fi

exists=`git show-ref refs/heads/$dist`

if [ -n "$exists" ]; then
    git branch -D $dist
fi

git checkout --orphan $dist 2>&1

if [ $? -eq 1 ]; then
    # If checkout failed
    echo "=========="
    echo "Could not checkout branch dist! See the error above and fix it!"
    exit 1
fi

git reset
rm -rf .js
npm run clean:multisrc
npm run build:multisrc
npx tsc --project tsconfig.production.json
npm run build:manifest

if [ ! -d ".dist" ] || [ -z "$(ls -A .dist)" ]; then
    echo "=========="
    echo "JSON files were not generated! See the error above and fix it!"
    exit 1
fi

git add -f public/static .dist .js/src/plugins total.svg
git commit -m "chore: Publish Plugins"
git push -f origin $dist 2>&1
git checkout -f $current 2>&1

