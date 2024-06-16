import list from './sources.json' with { type: 'json' };
import defaultSettings from './settings.json' with { type: 'json' };
import { readFileSync } from 'fs';
import path from 'path';

export const generateAll = function () {
  return list.map(metadata => {
    metadata.filters = Object.assign(defaultSettings.filters, metadata.filters);
    console.log(`[ifreedom]: Generating`, metadata.id);
    return generator(metadata);
  });
};

const generator = function generator(metadata) {
  const IfreedomTemplate = readFileSync(
    './scripts/multisrc/ifreedom/template.ts',
    {
      encoding: 'utf-8',
    },
  );

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
  };
};
