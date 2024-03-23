import { Filters, FilterTypes } from '../../../libs/filterInputs';
import { ScrpitGeneratorFunction } from '../generate';
import list from './sources.json';
import defaultSettings from './settings.json';
import { RulateMetadata } from './template';
import { readFileSync } from 'fs';
import path from 'path';

export const generateAll: ScrpitGeneratorFunction = function (name) {
  return list
    .map<RulateMetadata>(p => {
      if (p.filters) {
        p.filters.cat.options.unshift(...defaultSettings.filters.cat.options);
      }
      p.filters = Object.assign(defaultSettings.filters, p.filters);

      let d = false;
      const filters: any = {};
      for (const k in p.filters) {
        const f = p.filters[k as keyof typeof p.filters];
        if (f) {
          filters[k] = {
            ...f,
            type: FilterTypes[f.type as keyof typeof FilterTypes],
          };
        }
      }
      return { ...p, filters: d ? undefined : filters };
    })
    .map((metadata: RulateMetadata) => {
      console.log(`[${name}]: Generating`, metadata.id);
      return generator(metadata);
    });
};

const generator = function generator(metadata: RulateMetadata) {
  const rulateTemplate = readFileSync(path.join(__dirname, 'template.ts'), {
    encoding: 'utf-8',
  });

  const pluginScript = `
  ${rulateTemplate}
const plugin = new RulatePlugin(${JSON.stringify(metadata)
    .replace(/"type":"([^"]+)"/g, '"type":FilterTypes.$1')
    .replace(/\.XCheckbox/g, '.ExcludableCheckboxGroup') //remember to redo
    .replace(/\.Checkbox/g, '.CheckboxGroup')});
export default plugin;
    `.trim();

  return {
    lang: 'russian',
    filename: metadata.sourceName,
    pluginScript,
  };
};
