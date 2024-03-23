import path from 'path';
import fs from 'fs';

type GeneratedScript = {
  lang: string;
  filename: string;
  pluginScript: string;
};

export type ScrpitGeneratorFunction = (name: string) => GeneratedScript[];

const isScriptGenerator = (s: unknown): s is ScrpitGeneratorFunction => {
  return !!s && typeof s === 'function';
};

const generate = async (name: string): Promise<boolean> => {
  try {
    const generateAll: ScrpitGeneratorFunction | unknown = require(
      `./${name}/generator`,
    ).generateAll;
    if (!isScriptGenerator(generateAll)) return false;
    const sources = generateAll(name);
    for (let source of sources) {
      const { lang, filename, pluginScript } = source;
      if (!lang || !filename || !pluginScript) {
        console.warn(name, ': lang, filename, pluginScript are required!');
        continue;
      }
      const pluginsDir = path.join(
        path.dirname(path.dirname(__dirname)),
        'plugins',
      );
      const filePath = path.join(
        pluginsDir,
        lang.toLowerCase(),
        filename.replace(/[\s-\.]+/g, '') + `[${name}].ts`,
      );
      fs.writeFileSync(filePath, pluginScript, { encoding: 'utf-8' });
    }
    return true;
  } catch (e) {
    console.log(`${name} is broken! ${e}`);
    return false;
  }
};

const run = async () => {
  const sources = fs
    .readdirSync(__dirname)
    .filter(
      name =>
        fs.lstatSync(path.join(__dirname, name)).isDirectory() &&
        !name.endsWith('.broken'),
    );

  for (let name of sources) {
    const success = await generate(name);
    if (success) console.log(`[${name}] OK`);
  }
};

run();
