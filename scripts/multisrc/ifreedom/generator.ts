import { Filters } from '../../../libs/filterInputs';
import { ScrpitGeneratorFunction } from '../generate';
import list from './sources.json';
import defaultSettings from './settings.json';
import { IfreedomMetadata } from './template';
import { readFileSync } from 'fs';
import path from 'path';

export const generateAll: ScrpitGeneratorFunction = function (name) {
  return list.map((metadata: IfreedomMetadata) => {
    metadata.filters = Object.assign(defaultSettings.filters, metadata.filters);
    console.log(`[${name}]: Generating`, metadata.id);
    return generator(metadata);
  });
};

const generator = function generator(metadata: IfreedomMetadata) {
  const IfreedomTemplate = readFileSync(path.join(__dirname, 'template.ts'), {
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
  };
};
