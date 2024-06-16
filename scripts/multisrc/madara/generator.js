import list from './sources.json' with { type: 'json' };
import { readFileSync } from 'fs';

export const generateAll = function () {
  return list.map(metadata => {
    let filters = {};
    try {
      filters = require(`./filters/${metadata.id}`);
      metadata.filters = filters.filters;
    } catch (e) {}
    console.log(
      `[madara] Generating: ${metadata.id}${' '.repeat(20 - metadata.id.length)} ${metadata.filters ? '🔎with filters🔍' : '🚫no filters🚫'}`,
    );
    return generator(metadata);
  });
};

const generator = function generator(metadata) {
  const madaraTemplate = readFileSync('./scripts/multisrc/madara/template.ts', {
    encoding: 'utf-8',
  });

  const pluginScript = `
${madaraTemplate}
const plugin = new MadaraPlugin(${JSON.stringify(metadata)});
export default plugin;
    `.trim();
  return {
    lang: metadata.options?.lang || 'English',
    filename: metadata.sourceName,
    pluginScript,
  };
};
