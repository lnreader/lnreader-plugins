require('module-alias/register');

import * as fs from 'fs';
import { languages } from '@libs/languages';
import * as path from 'path';
import { Plugin } from '@typings/plugin';
import { minify } from './terser';

const root = path.dirname(__dirname);
const outRoot = path.join(root, '..');
const { execSync } = require('child_process');
const REMOTE = execSync('git remote get-url origin')
  .toString()
  .replace(/[\s\n]/g, '');
let CURRENT_BRANCH = 'dist';
try {
  CURRENT_BRANCH = execSync('git rev-parse --abbrev-ref HEAD')
    .toString()
    .replace(/[\s\n]/g, '');
} catch {
  //
}
const matched = REMOTE.match(/([^:/]+?)\/([^/.]+)(\.git)?$/);
if (!matched) throw Error('Cant parse git url');
const USERNAME = matched[1];
const REPO = matched[2];
const USER_CONTENT_LINK = `https://raw.githubusercontent.com/${USERNAME}/${REPO}/${CURRENT_BRANCH}`;

const ICON_LINK = `${USER_CONTENT_LINK}/icons`;
const PLUGIN_LINK = `${USER_CONTENT_LINK}/.js/plugins`;

const json: {
  [key: string]: {
    id: string;
    name: string;
    site: string;
    lang: string;
    version: string;
    url: string;
    iconUrl: string;
  }[];
} = {};
if (!fs.existsSync(path.join(outRoot, '.dist'))) {
  fs.mkdirSync(path.join(outRoot, '.dist'));
}
const jsonPath = path.join(outRoot, '.dist', 'plugins.json');
const jsonMinPath = path.join(outRoot, '.dist', 'plugins.min.json');
const pluginSet = new Set();
let totalPlugins = 0;

for (let language in languages) {
  // language with English name
  const langPath = path.join(root, 'plugins', language.toLowerCase());
  if (!fs.existsSync(langPath)) continue;
  const plugins = fs.readdirSync(langPath);
  json[language] = [];
  plugins.forEach(plugin => {
    if (plugin.startsWith('.')) return;
    minify(path.join(langPath, plugin));
    const instance: Plugin.PluginBase = require(
      `../plugins/${language.toLowerCase()}/${plugin.split('.')[0]}`,
    ).default;

    const { id, name, site, version, icon } = instance;
    const normalisedName = name.replace(/\[.*\]/, '');

    const info = {
      id,
      name: normalisedName,
      site,
      lang: language,
      version,
      url: `${PLUGIN_LINK}/${language.toLowerCase()}/${plugin}`,
      iconUrl: `${ICON_LINK}/${icon}`,
    } as const;

    if (pluginSet.has(id)) {
      console.log("There's already a plugin with id:", id);
      throw new Error('2 or more plugins have the same id');
    } else {
      pluginSet.add(id);
    }
    json[language].push(info);
    totalPlugins += 1;
    console.log(name, '✅');
  });
}

for (let lang in json) json[lang].sort((a, b) => a.id.localeCompare(b.id));

fs.writeFileSync(jsonMinPath, JSON.stringify(json));
fs.writeFileSync(jsonPath, JSON.stringify(json, null, '\t'));
if (CURRENT_BRANCH === 'dist') {
  fetch(`https://img.shields.io/badge/Plugins-${totalPlugins}-blue`)
    .then(res => res.text())
    .then(data => {
      fs.writeFileSync('total.svg', data, { encoding: 'utf-8' });
    });
}

// check for broken plugins
for (let language in languages) {
  const tsFiles = fs.readdirSync(
    path.join(root, '..', 'plugins', language.toLocaleLowerCase()),
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
