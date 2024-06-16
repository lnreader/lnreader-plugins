import list from './sources.json' with { type: 'json' };
import { readFileSync } from 'fs';
import path from 'path';

export const generateAll = function () {
  return list.map(metadata => {
    try {
      const { filters } = require(`./filters/${metadata.id}`);
      metadata.filters = filters;
    } catch (e) {}
    console.log(
      `[readwn] Generating: ${metadata.id}${' '.repeat(20 - metadata.id.length)} ${metadata.filters ? '🔎with filters🔍' : '🚫no filters🚫'}`,
    );
    return generator(metadata);
  });
};

const generator = function generator(metadata) {
  const readwnTemplate = readFileSync('./scripts/multisrc/readwn/template.ts', {
    encoding: 'utf-8',
  });

  const pluginScript = `
${readwnTemplate}
const plugin = new ReadwnPlugin(${JSON.stringify(metadata)});
export default plugin;
    `.trim();

  return {
    lang: 'english',
    filename: metadata.sourceName,
    pluginScript,
  };
};
