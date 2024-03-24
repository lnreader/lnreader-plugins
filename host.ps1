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
npm run json
git add -f icons .dist .js/plugins total.svg
git commit -m "Host plugins"
git push -f origin $dist

git checkout -f $current

