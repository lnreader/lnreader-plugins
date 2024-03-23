import { FilterTypes, Filters } from '../../../libs/filterInputs';
import { ScrpitGeneratorFunction } from '../generate';
import list from './sources.json';
import { HotNovelPubMetadata } from './template';
import { readFileSync } from 'fs';
import path from 'path';

const lang: { [key: string]: string } = {
  en: 'english',
  ru: 'russian',
  es: 'spanish',
  pt: 'portuguese',
  th: 'turkish',
};

export const generateAll: ScrpitGeneratorFunction = function (name) {
  return list
    .map<HotNovelPubMetadata>(p => {
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
      return { ...p, filters };
    })
    .map((metadata: HotNovelPubMetadata) => {
      console.log(`[${name}]: Generating`, metadata.id);
      return generator(metadata);
    });
};

const generator = function generator(metadata: HotNovelPubMetadata) {
  const HotNovelPubTemplate = readFileSync(
    path.join(__dirname, 'template.ts'),
    {
      encoding: 'utf-8',
    },
  );

  const pluginScript = `
    ${HotNovelPubTemplate}
const plugin = new HotNovelPubPlugin(${JSON.stringify(metadata).replace(
    /"type":"([^"]+)"/g,
    '"type":FilterTypes.$1',
  )});
export default plugin;
    `.trim();

  return {
    lang: lang[metadata?.options?.lang || 'en'] || 'english',
    filename: metadata.sourceName,
    pluginScript,
  };
};
