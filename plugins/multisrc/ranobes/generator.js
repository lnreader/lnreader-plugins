import list from './sources.json' with { type: 'json' };
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const folder = dirname(fileURLToPath(import.meta.url));

export const generateAll = function () {
  return list.map(metadata => {
    console.log(
      `[ranobes]: Generating`,
      metadata.id,
      metadata.options?.downSince
        ? `since: ${metadata.options?.downSince}`
        : '',
    );
    return generator(metadata);
  });
};

const generator = function generator(metadata) {
  const RanobesTemplate = readFileSync(join(folder, 'template.ts'), {
    encoding: 'utf-8',
  });

  const pluginScript = `
    ${RanobesTemplate}
const plugin = new RanobesPlugin(${JSON.stringify(metadata)});
export default plugin;
    `.trim();

  return {
    lang: metadata.options.lang,
    filename: metadata.sourceName,
    pluginScript,
    down: metadata.options?.down || false,
  };
};
