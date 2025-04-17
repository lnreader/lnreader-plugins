$current=$(git rev-parse --abbrev-ref HEAD)
$version=$(node -e "console.log(require('./package.json').version);")
$dist="plugins/v$($version)"
$exists=$(git show-ref refs/heads/$dist)

if  ($exists){
    git branch -D $dist
}

git checkout --orphan $dist

if(-Not $?){
    # If checkout failed
    echo "=========="
    echo "Could not checkout branch dist! See the error above and fix it!"
    exit 1
}

git reset
rm -r -fo .js
npm run clearMultisrc
npm run generate
npx tsc --project tsconfig.production.json
npm run json

if (-not (Test-Path .dist) -or -not (Get-ChildItem -Path .dist -Force)) {
    echo "=========="
    echo "JSON files were not generated! See the error above and fix it!"
    exit 1
}

git add -f public/static .dist .js/src/plugins total.svg
git commit -m "chore: Publish Plugins"
git push -f origin $dist

git checkout -f $current

