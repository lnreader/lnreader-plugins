import list from './sources.json' with { type: 'json' };
import defaultSettings from './settings.json' with { type: 'json' };
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const folder = dirname(fileURLToPath(import.meta.url));

export const generateAll = function () {
  return list.map(metadata => {
    metadata.filters = Object.assign(defaultSettings.filters, metadata.filters);
    console.log(
      `[ifreedom]: Generating`,
      metadata.id,
      metadata.options?.downSince
        ? `since: ${metadata.options?.downSince}`
        : '',
    );
    return generator(metadata);
  });
};

const generator = function generator(metadata) {
  const IfreedomTemplate = readFileSync(join(folder, 'template.ts'), {
    encoding: 'utf-8',
  });

  const pluginScript = `
    ${IfreedomTemplate}
const plugin = new IfreedomPlugin(${JSON.stringify(metadata).replace(
    /"type":"([^"]+)"/g,
    '"type":FilterTypes.$1',
  )});
export default plugin;
    `.trim();

  return {
    lang: 'russian',
    filename: metadata.sourceName,
    pluginScript,
    down: metadata.options?.down || false,
  };
};
