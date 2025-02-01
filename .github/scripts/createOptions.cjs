const version = require('../../package.json').version;
const dist = `plugins/v${version}`;
const fs = require('fs');

const rawText = fs.readFileSync(
  '.github/scripts/blank_report_issue.yml',
  'utf8',
);

async function main() {
  const pluginsRaw = await fetch(
    `https://raw.githubusercontent.com/LNReader/lnreader-plugins/${dist}/.dist/plugins.min.json`,
  ).then(res => res.json());
  const plugins = pluginsRaw.reduce((arr, plugin) => {
    arr[plugin.lang + ': ' + plugin.name] = plugin.id;
    return arr;
  }, {});

  let newKeys = Object.keys(plugins);
  let savedKeys = [];
  try {
    let keys = JSON.parse(fs.readFileSync('.github/scripts/keys.json', 'utf8'));
    savedKeys = Object.keys(keys);
  } catch (err) {
    console.log(err);
  }
  if (!sameKeys(newKeys, savedKeys) && Array.isArray(newKeys)) {
    const text = newKeys.join('"\n        - "');
    fs.writeFileSync(
      '.github/ISSUE_TEMPLATE/report_issue.yml',
      rawText.replace(/{#CHANGE#}/g, '- "' + text + '"'),
    );
    fs.writeFileSync('.github/scripts/keys.json', JSON.stringify(plugins));
  }
  function sameKeys(a, b) {
    return a.length === b.length && a.every(value => b.includes(value));
  }
}

main();
