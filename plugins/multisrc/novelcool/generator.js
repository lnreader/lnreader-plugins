import list from './sources.json' with { type: 'json' };
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://app.novelcool.com/
const app = {
  userAgent:
    'Android/Package:com.zuoyou.novel - Version Name:2.3 - Phone Info:sdk_gphone_x86_64(Android Version:13)',
  package_name: 'com.zuoyou.novel',
  appId: '202201290625004',
  secret: 'c73a8590641781f203660afca1d37ada',
};

export const generateAll = function () {
  list.sort((a, b) => a.id.length - b.id.length);
  return list.map(source => generator(source));
};

const generator = function generator(source) {
  const NovelCoolTemplate = readFileSync(__dirname + '/template.ts', {
    encoding: 'utf-8',
  });
  source.options.app = app;

  const pluginScript = `
  ${NovelCoolTemplate}

const plugin = new NovelCoolPlugin(${JSON.stringify(source)});
export default plugin;
    `.trim();

  return {
    lang: source.options.lang,
    filename: source.sourceName,
    pluginScript,
    down: source.options?.down || false,
  };
};
