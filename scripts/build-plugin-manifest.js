import path from 'path';
import fs from 'fs';
import languages from './languages.js';
import { execSync } from 'child_process';
import { minify } from './terser.js';

const REMOTE = execSync('git remote get-url origin')
  .toString()
  .replace(/[\s\n]/g, '');
const CURRENT_BRANCH = execSync('git branch --show-current')
  .toString()
  .replace(/[\s\n]/g, '');
const BRANCH = process.env.BRANCH ? process.env.BRANCH : CURRENT_BRANCH;
const matched = REMOTE.match(/([^:/]+?)\/([^/.]+)(\.git)?$/);
if (!matched) throw Error('Cant parse git url');
const USERNAME = matched[1];
const REPO = matched[2];
const USER_CONTENT_LINK = process.env.USER_CONTENT_BASE
  ? process.env.USER_CONTENT_BASE
  : `https://raw.githubusercontent.com/${USERNAME}/${REPO}/${BRANCH}`;

const STATIC_LINK = `${USER_CONTENT_LINK}/public/static`;
// Use legacy .js/src/plugins path for backward compatibility
const PLUGIN_LINK = `${USER_CONTENT_LINK}/.js/src/plugins`;

const DIST_DIR = '.dist';

let json = [];
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR);
}
const jsonPath = path.join(DIST_DIR, 'plugins.json');
const jsonMinPath = path.join(DIST_DIR, 'plugins.min.json');
const pluginSet = new Set();
const pluginsPerLanguage = {};
const pluginsWithFiltersPerLanguage = {};

const args = process.argv.slice(2);
let ONLY_NEW = args.includes('--only-new');

let existingPlugins = {};
if (!fs.existsSync(jsonPath)) ONLY_NEW = false;
if (ONLY_NEW) {
  try {
    const existingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    json = existingJson;
    for (const plugin of existingJson) {
      existingPlugins[plugin.id] = plugin;
    }
  } catch (e) {
    console.warn('Failed to parse existing plugins.json:', e);
  }
}

// Simple semver comparison: "1.2.3" < "1.2.4"
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

const createRecursiveProxy = () => {
  const target = {};
  const handler = {
    get(target, prop) {
      if (prop === 'get') {
        return a => a;
      }
      if (!target[prop]) {
        target[prop] = createRecursiveProxy();
      }
      return target[prop];
    },
  };
  return new Proxy(target, handler);
};

const proxy = createRecursiveProxy();

const _require = () => proxy;

const COMPILED_PLUGIN_DIR = './.js/plugins';

for (let language in languages) {
  console.log(
    ` ${language} `
      .padStart(Math.floor((language.length + 32) / 2), '=')
      .padEnd(30, '='),
  );

  const langPath = path.join(COMPILED_PLUGIN_DIR, language.toLowerCase());
  if (!fs.existsSync(langPath)) continue;
  const plugins = fs.readdirSync(langPath);

  pluginsPerLanguage[language] = 0;
  pluginsWithFiltersPerLanguage[language] = 0;

  plugins.forEach(plugin => {
    if (plugin.startsWith('.')) return;
    minify(path.join(langPath, plugin));
    const rawCode = fs.readFileSync(
      `${COMPILED_PLUGIN_DIR}/${language.toLowerCase()}/${plugin}`,
      'utf-8',
    );
    const instance = Function(
      'require',
      'module',
      `const exports = module.exports = {}; 
      ${rawCode}; 
      return exports.default`,
    )(_require, {});
    const { id, name, site, version, icon, customJS, customCSS, filters } =
      instance;
    const normalisedName = name.replace(/\[.*\]/, '');

    // --only-new logic
    if (
      ONLY_NEW &&
      existingPlugins[id] &&
      compareVersions(existingPlugins[id].version, version) >= 0
    ) {
      // console.log(`   Skipping ${name} (${id}) - not newer`, '\r🔁');
      return;
    }

    const info = {
      id,
      name: normalisedName,
      site,
      lang: languages[language],
      version,
      url: `${PLUGIN_LINK}/${language.toLowerCase()}/${plugin}`,
      iconUrl: `${STATIC_LINK}/${icon || 'siteNotAvailable.png'}`,
      customJS: customJS ? `${STATIC_LINK}/${customJS}` : undefined,
      customCSS: customCSS ? `${STATIC_LINK}/${customCSS}` : undefined,
    };

    if (pluginSet.has(id)) {
      console.log("There's already a plugin with id:", id);
      throw new Error('2 or more plugins have the same id');
    } else {
      pluginSet.add(id);
    }
    json.push(info);

    pluginsPerLanguage[language] += 1;
    if (filters !== undefined) {
      pluginsWithFiltersPerLanguage[language] += 1;
    }

    console.log(
      '   ',
      name.padEnd(25),
      ` (${id})`,
      filters == undefined ? '\r✅' : '\r✅🔍',
    );
  });
}

json.sort((a, b) => {
  if (a.lang === b.lang) return a.id.localeCompare(b.id);
  return 0;
});

fs.writeFileSync(jsonMinPath, JSON.stringify(json));
fs.writeFileSync(jsonPath, JSON.stringify(json, null, '\t'));

const totalPlugins = Object.values(pluginsPerLanguage).reduce(
  (a, b) => a + b,
  0,
);
if (!ONLY_NEW)
  fs.writeFileSync(
    'total.svg',
    `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="20" role="img" aria-label="Plugins: ${totalPlugins}">
      <title>Plugins: ${totalPlugins}</title>
      <linearGradient id="s" x2="0" y2="100%">
        <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
        <stop offset="1" stop-opacity=".1"/>
      </linearGradient>
      <clipPath id="r">
        <rect width="80" height="20" rx="3" fill="#fff"/>
      </clipPath>
      <g clip-path="url(#r)">
        <rect width="49" height="20" fill="#555"/>
        <rect x="49" width="31" height="20" fill="#007ec6"/>
        <rect width="80" height="20" fill="url(#s)"/>
      </g>
      <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
        <text aria-hidden="true" x="255" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="390">plugins</text>
        <text x="255" y="140" transform="scale(.1)" fill="#fff" textLength="390">plugins</text>
        <text aria-hidden="true" x="635" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="210">${totalPlugins}</text>
        <text x="635" y="140" transform="scale(.1)" fill="#fff" textLength="210">${totalPlugins}</text>
      </g>
    </svg>
    `,
  );

// check for broken plugins
for (let language in languages) {
  const tsFiles = fs.readdirSync(
    path.join('./plugins', language.toLocaleLowerCase()),
  );
  tsFiles
    .filter(f => f.endsWith('.broken.ts'))
    .forEach(fn => {
      console.error(
        language.toLocaleLowerCase() +
          '/' +
          fn.replace('.broken.ts', '') +
          ' ❌',
      );
    });
}

console.log(jsonPath);
console.log('Done ✅');

const totalPluginsWithFilter = Object.values(
  pluginsWithFiltersPerLanguage,
).reduce((a, b) => a + b, 0);

// Markdown table for GitHub Actions
console.warn('\n| Language | Plugins (With Filters) |');
console.warn('|----------|------------------------|');
for (const language of Object.keys(languages)) {
  console.warn(
    `| ${language} | ${pluginsPerLanguage[language] || 0} (${pluginsWithFiltersPerLanguage[language] || 0}) |`,
  );
}
console.warn('|----------|------------------------|');
console.warn(`| Total | ${totalPlugins} (${totalPluginsWithFilter}) |`);
