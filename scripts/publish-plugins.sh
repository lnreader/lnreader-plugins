#!/bin/bash

if [ -z "$GITHUB_STEP_SUMMARY" ]; then
    GITHUB_STEP_SUMMARY="/dev/stdout"
fi

current=`git rev-parse --abbrev-ref HEAD`
version=`node -e "console.log(require('./package.json').version);"`


rm -rf .js
npm run clean:multisrc
npm run build:multisrc
echo "Compiling TypeScript..."
npx tsc --project tsconfig.production.json

# Copy plugins to legacy path (.js/src/plugins) for backward compatibility
echo "Copying .js/plugins -> .js/src/plugins"
mkdir -p .js/src
cp -r .js/plugins .js/src/plugins


commit-to-target () {
    
    target=$1

    echo "Publishing plugins: $current -> $target (v$version)"

    # switch to target branch
    exists=`git show-ref refs/heads/$target`

    if [ -n "$exists" ]; then
        git branch -D $target
    fi

    git checkout --orphan $target 2>&1

    if [ $? -eq 1 ]; then
        echo "❌ ERROR: Failed to create branch $target"
        exit 1
    fi

    # The manifest needs to be built separately for each target branch,
    # because the raw.githubusercontent.com URLs will be different
    npm run build:manifest

    if [ ! -d ".dist" ] || [ -z "$(ls -A .dist)" ]; then
        echo "❌ ERROR: Manifest generation failed - .dist is missing or empty"
        exit 1
    fi

    # publish only the built files to the target branch
    git reset
    git add -f public/static .dist .js/src/plugins .js/plugins total.svg
    git commit -m "chore: Publish Plugins"
    git push -f origin $target 2>&1
}


commit-to-target "dist/$current"

if [ "$current" == "master" ]; then
    commit-to-target "plugins/v$version"
fi

# switch back
git checkout -f $current 2>&1
echo "✅ Published to $dist"

