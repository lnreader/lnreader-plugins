import path from 'path';
import fs from 'fs';

// type GeneratedScript = {
//   lang: string;
//   filename: string;
//   pluginScript: string;
//   down?: boolean;
// };

// export type ScrpitGeneratorFunction = () => GeneratedScript[];

const isScriptGenerator = s => {
  return !!s && typeof s === 'function';
};

const generate = async name => {
  try {
    const generateAll = (await import(`./${name}/generator.js`)).generateAll;
    if (!isScriptGenerator(generateAll)) return false;
    const sources = generateAll();
    for (let source of sources) {
      const { lang, filename, pluginScript, down } = source;
      if (!lang || !filename || !pluginScript) {
        console.warn(name, ': lang, filename, pluginScript are required!');
        continue;
      }
      const pluginsDir = './plugins';
      const filePath = path.join(
        pluginsDir,
        lang.toLowerCase(),
        filename.replace(/[\s-\.]+/g, '') +
          `[${name}]${down ? '.broken' : ''}.ts`,
      );
      fs.writeFileSync(filePath, pluginScript, { encoding: 'utf-8' });
    }
    return true;
  } catch (e) {
    console.log(`${name} is broken! ${e}\n`);
    return false;
  }
};

const MULTISRC_DIR = './plugins/multisrc';

const run = async () => {
  const sources = fs
    .readdirSync(MULTISRC_DIR)
    .filter(
      name =>
        fs.lstatSync(path.join(MULTISRC_DIR, name)).isDirectory() &&
        !name.endsWith('.broken'),
    );

  for (let name of sources) {
    const success = await generate(name);
    if (success) console.log(`[${name}] OK`);
  }
};

run();
