import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const folder = dirname(fileURLToPath(import.meta.url));

import list from './sources.json' with { type: 'json' };

export const generateAll = function () {
  return list.map(source => {
    console.log(
      `[fictioneer] Generating: ${source.id}${' '.repeat(20 - source.id.length)}`,
    );
    return generator(source);
  });
};

const generator = function generator(source) {
  const readNovelFullTemplate = readFileSync(join(folder, 'template.ts'), {
    encoding: 'utf-8',
  });

  const pluginScript = `
${readNovelFullTemplate}
const plugin = new FictioneerPlugin(${JSON.stringify(source)});
export default plugin;
    `.trim();
  return {
    lang: source.options?.lang || 'English',
    filename: source.sourceName,
    pluginScript,
  };
};
