import path from 'path';
import fs from 'fs';

// type GeneratedScript = {
//   lang: string;
//   filename: string;
//   pluginScript: string;
// };

// export type ScrpitGeneratorFunction = () => GeneratedScript[];

const isScriptGenerator = s => {
  return !!s && typeof s === 'function';
};

const PLUGINS_DIR = './plugins';

// Drops a generator's previous output, so sources that are now skipped
// (e.g. marked down) or renamed do not linger when the playground runs
// generation without `clean:multisrc` first.
const removeGenerated = name => {
  for (const lang of fs.readdirSync(PLUGINS_DIR)) {
    const dir = path.join(PLUGINS_DIR, lang);
    if (lang === 'multisrc' || !fs.lstatSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(`[${name}].ts`)) fs.unlinkSync(path.join(dir, file));
    }
  }
};

const generate = async name => {
  try {
    const generateAll = (await import(`./${name}/generator.js`)).generateAll;
    if (!isScriptGenerator(generateAll)) return false;
    const sources = generateAll();
    // only after generateAll succeeded, so a broken generator keeps its output
    removeGenerated(name);
    for (let source of sources) {
      const { lang, filename, pluginScript } = source;
      if (!lang || !filename || !pluginScript) {
        console.warn(name, ': lang, filename, pluginScript are required!');
        continue;
      }
      const filePath = path.join(
        PLUGINS_DIR,
        lang.toLowerCase(),
        filename.replace(/[\s-.]+/g, '') + `[${name}].ts`,
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
