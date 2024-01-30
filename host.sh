current=`git rev-parse --abbrev-ref HEAD`
dist=dist
exists=`git show-ref refs/heads/$dist`

if [ -n "$exists" ]; then
    git checkout $dist
else
    git checkout -b $dist
fi

git merge $current --strategy-option theirs

npm run generate
npm run json
git add .
git add -f .dist .js/plugins
git commit -m "Update plugins host"
git push -f origin $dist

git checkout $current
