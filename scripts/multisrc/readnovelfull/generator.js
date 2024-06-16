import { readFileSync } from 'fs';
import path from 'path';

import list from './sources.json' with { type: 'json' };

export const generateAll = function () {
  return list.map(metadata => {
    console.log(
      `[readnovelfull] Generating: ${metadata.id}${' '.repeat(20 - metadata.id.length)}`,
    );
    return generator(metadata);
  });
};

const generator = function generator(metadata) {
  const readNovelFullTemplate = readFileSync(
    './scripts/multisrc/readnovelfull/template.ts',
    { encoding: 'utf-8' },
  );

  const pluginScript = `
${readNovelFullTemplate}
const plugin = new ReadNovelFullPlugin(${JSON.stringify(metadata)});
export default plugin;
    `.trim();
  return {
    lang: metadata.options?.lang || 'English',
    filename: metadata.sourceName,
    pluginScript,
  };
};
