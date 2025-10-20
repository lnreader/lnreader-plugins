const version = require('../../package.json').version;
const dist = `plugins/v${version}`;
const fs = require('fs');

const rawText = fs.readFileSync(
  '.github/scripts/blank_report_issue.yml',
  'utf8',
);

async function main() {
  console.log(`Fetching plugins from: ${dist}`);

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
    console.log(`Found ${pluginsRaw.length} plugins`);

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
      console.log(`Loaded ${savedKeys.length} existing plugin keys`);
    } catch (err) {
      console.log('No existing keys file found, creating new one');
    }

    if (!sameKeys(newKeys, savedKeys) && Array.isArray(newKeys)) {
      console.log('Plugin list has changed, updating issue template...');
      const text = newKeys.join('"\n        - "');
      fs.writeFileSync(
        '.github/ISSUE_TEMPLATE/report_issue.yml',
        rawText.replace(/{#CHANGE#}/g, '- "' + text + '"'),
      );
      fs.writeFileSync('.github/scripts/keys.json', JSON.stringify(plugins));
      console.log('Issue template updated successfully');
    } else {
      console.log('No changes detected in plugin list');
    }

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
