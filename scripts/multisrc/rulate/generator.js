import list from './sources.json' with { type: 'json' };
import defaultSettings from './settings.json' with { type: 'json' };
import { readFileSync } from 'fs';

const FilterTypes = {
  TextInput: 'Text',
  Picker: 'Picker',
  CheckboxGroup: 'Checkbox',
  Switch: 'Switch',
  ExcludableCheckboxGroup: 'XCheckbox',
};

export const generateAll = function () {
  return list
    .map(p => {
      if (p.filters) {
        p.filters.cat.options.unshift(...defaultSettings.filters.cat.options);
      }
      p.filters = Object.assign(defaultSettings.filters, p.filters);

      let d = false;
      const filters = {};
      for (const k in p.filters) {
        const f = p.filters[k];
        if (f) {
          filters[k] = {
            ...f,
            type: FilterTypes[f.type],
          };
        }
      }
      return { ...p, filters: d ? undefined : filters };
    })
    .map(metadata => {
      console.log(`[rulate]: Generating`, metadata.id);
      return generator(metadata);
    });
};

const generator = function generator(metadata) {
  const rulateTemplate = readFileSync('./scripts/multisrc/rulate/template.ts', {
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
