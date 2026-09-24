const version = require('../../package.json').version;
const dist = `plugins/v${version}`;
const fs = require('fs');

const rawText = fs.readFileSync(
  '.github/scripts/blank_report_issue.yml',
  'utf8',
);

async function main() {
  console.log(`Fetching published plugin manifest from ${dist}...`);

  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/LNReader/lnreader-plugins/${dist}/.dist/plugins.min.json`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch plugins: ${response.status} ${response.statusText}`,
      );
    }

    const pluginsRaw = await response.json();
    console.log(`Loaded ${pluginsRaw.length} plugins from the manifest.`);

    const plugins = pluginsRaw.reduce((arr, plugin) => {
      arr[plugin.lang + ': ' + plugin.name] = plugin.id;
      return arr;
    }, {});

    let newKeys = Object.keys(plugins);
    let savedKeys = [];
    try {
      let keys = JSON.parse(
        fs.readFileSync('.github/scripts/keys.json', 'utf8'),
      );
      savedKeys = Object.keys(keys);
      console.log(`Loaded ${savedKeys.length} saved plugin keys.`);
    } catch (err) {
      console.log('No saved plugin keys found; a new key map will be created.');
    }

    const text = newKeys.join('"\n        - "');
    const issueTemplate = rawText.replace(/{#CHANGE#}/g, '- "' + text + '"');

    const keysChanged = !sameKeys(newKeys, savedKeys) && Array.isArray(newKeys);
    if (keysChanged) {
      console.log(
        `Plugin keys changed (${savedKeys.length} → ${newKeys.length}); writing keys.json.`,
      );
      fs.writeFileSync('.github/scripts/keys.json', JSON.stringify(plugins));
    } else {
      console.log('Plugin keys are up to date.');
    }

    const templateChanged =
      fs.readFileSync('.github/ISSUE_TEMPLATE/report_issue.yml', 'utf8') !==
      issueTemplate;
    if (templateChanged) {
      fs.writeFileSync(
        '.github/ISSUE_TEMPLATE/report_issue.yml',
        issueTemplate,
      );
      console.log('Issue template changed; writing report_issue.yml.');
    } else {
      console.log('Issue template is up to date.');
    }

    console.log(
      `Generation complete (${keysChanged || templateChanged ? 'changes written' : 'no changes'}).`,
    );

    function sameKeys(a, b) {
      return a.length === b.length && a.every(value => b.includes(value));
    }
  } catch (error) {
    console.error('Error generating issue template options:', error.message);
    throw error;
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
