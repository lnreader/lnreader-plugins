import list from './sources.json' with { type: 'json' };
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const folder = dirname(fileURLToPath(import.meta.url));

export const generateAll = function () {
  return list.map(source => {
    const exist = existsSync(join(folder, 'filters', source.id + '.json'));
    if (exist) {
      const filters = readFileSync(
        join(folder, 'filters', source.id + '.json'),
      );
      source.filters = JSON.parse(filters).filters;
    }
    console.log(
      `[readwn] Generating: ${source.id}${' '.repeat(20 - source.id.length)}`,
      `${source.options?.down ? '🔽site is down🔽' : source.filters ? '🔎with filters🔍' : '🚫no filters🚫'}`,
      source.options?.downSince ? `since: ${source.options?.downSince}` : '',
    );
    return generator(source);
  });
};

const generator = function generator(source) {
  const readwnTemplate = readFileSync(join(folder, 'template.ts'), {
    encoding: 'utf-8',
  });

  const pluginScript = `
${readwnTemplate}
const plugin = new ReadwnPlugin(${JSON.stringify(source)});
export default plugin;
    `.trim();

  return {
    lang: 'english',
    filename: source.sourceName,
    pluginScript,
    down: source.options?.down || false,
  };
};
