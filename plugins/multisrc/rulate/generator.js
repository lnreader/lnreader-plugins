import list from './sources.json' with { type: 'json' };
import defaultSettings from './settings.json' with { type: 'json' };
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const folder = dirname(fileURLToPath(import.meta.url));
const key = 'fpoiKLUues81werht039';

export const generateAll = function () {
  return list.map(source => {
    source.key = key;
    source.filters = defaultSettings.filters;

    const exist = existsSync(
      join(folder, 'filters', source.sourceName + '.json'),
    );
    if (exist) {
      const filters = readFileSync(
        join(folder, 'filters', source.sourceName + '.json'),
      );
      source.filters = Object.assign(
        defaultSettings.filters,
        JSON.parse(filters).filters,
      );
    }

    console.log(`[rulate]: Generating`, source.id);
    return generator(source);
  });
};

const generator = function generator(source) {
  const rulateTemplate = readFileSync(join(folder, 'template.ts'), {
    encoding: 'utf-8',
  });

  const pluginScript = `
  ${rulateTemplate}
const plugin = new RulatePlugin(${JSON.stringify(source)});
export default plugin;
    `.trim();

  return {
    lang: 'russian',
    filename: source.sourceName,
    pluginScript,
  };
};
