import { FilterTypes, Filters } from '../../../libs/filterInputs';
import { ScrpitGeneratorFunction } from '../generate';
import list from './sources.json';
import defaultSettings from './settings.json';
import { ReadwnMetadata } from './template';
import { readFileSync } from 'fs';
import path from 'path';

export const generateAll: ScrpitGeneratorFunction = function (name) {
  return list
    .map<ReadwnMetadata>(p => {
      p.filters.tags.options.unshift(...defaultSettings.filters.tags.options);
      p.filters.genres.options.unshift(
        ...defaultSettings.filters.genres.options,
      );
      p.filters = Object.assign(defaultSettings.filters, p.filters);

      const d = false;
      const filters: Filters = {};
      for (const k in p.filters) {
        const f = p.filters[k as keyof typeof p.filters];
        if (f) {
          filters[k] = {
            ...f,
            type: FilterTypes.Picker,
          };
        }
      }
      return { ...p, filters: d ? undefined : filters };
    })
    .map((metadata: ReadwnMetadata) => {
      console.log(`[${name}]: Generating`, metadata.id);
      return generator(metadata);
    });
};

const generator = function generator(metadata: ReadwnMetadata) {
  const readwnTemplate = readFileSync(path.join(__dirname, 'template.ts'), {
    encoding: 'utf-8',
  });

  //metadata.filters = {
  //  sort: { ...defaultSettings.filters.sort, type: FilterTypes.Picker },
  //  status: { ...defaultSettings.filters.status, type: FilterTypes.Picker },
  //  ...metadata.filters,
  //};

  const pluginScript = `
    ${readwnTemplate}
const plugin = new ReadwnPlugin(${JSON.stringify(metadata).replace(
    /"type":"([^"]+)"/g,
    '"type":FilterTypes.$1',
  )});
export default plugin;
    `.trim();

  return {
    lang: 'english',
    filename: metadata.sourceName,
    pluginScript,
  };
};
