import list from './sources.json' with { type: 'json' };
import { readFileSync } from 'fs';

export const generateAll = function () {
  return list.map(source => {
    let filters = {};
    try {
      filters = require(`./filters/${source.id}`);
      source.filters = filters.filters;
    } catch (e) {}
    console.log(
      `[lightnovelworld] Generating: ${source.id}${' '.repeat(20 - source.id.length)} ${source.filters ? '🔎with filters🔍' : '🚫no filters🚫'}`,
    );
    return generator(source);
  });
};

const generator = function generator(source) {
  const LightNovelWPTemplate = readFileSync(
    './scripts/multisrc/lightnovelworld/template.ts',
    {
      encoding: 'utf-8',
    },
  );

  const pluginScript = `
${LightNovelWPTemplate}
const plugin = new LightNovelWorld(${JSON.stringify(source)});
export default plugin;
    `.trim();

  return {
    lang: source.options?.lang || 'English',
    filename: source.sourceName,
    pluginScript,
  };
};
