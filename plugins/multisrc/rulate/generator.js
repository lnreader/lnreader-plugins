import list from './sources.json' with { type: 'json' };
import defaultSettings from './settings.json' with { type: 'json' };
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const folder = dirname(fileURLToPath(import.meta.url));
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
    .map(source => {
      console.log(`[rulate]: Generating`, source.id);
      return generator(source);
    });
};

const generator = function generator(source) {
  const rulateTemplate = readFileSync(join(folder, 'template.ts'), {
    encoding: 'utf-8',
  });

  const pluginScript = `
  ${rulateTemplate}
const plugin = new RulatePlugin(${JSON.stringify(source)
    .replace(/"type":"([^"]+)"/g, '"type":FilterTypes.$1')
    .replace(/\.XCheckbox/g, '.ExcludableCheckboxGroup') //remember to redo
    .replace(/\.Checkbox/g, '.CheckboxGroup')});
export default plugin;
    `.trim();

  return {
    lang: 'russian',
    filename: source.sourceName,
    pluginScript,
  };
};
