/* global Buffer */
import * as fs from 'fs';
import * as path from 'path';
import sizeOf from 'image-size';

const size = 96;
const minSize = 16;

const skip = new Set([
  //custom icons
  'FWK.US',
  'LeafStudio',
  'RNRF',
  'ReN',
  'WTRLAB',
  'azora',
  'coralboutique',
  'crimsonscrolls',
  'daonovel',
  'dragonholic',
  'dragontea',
  'foxaholic',
  'kiniga',
  'lightnovelpubvip',
  'moonlightnovel',
  'mtl-novel',
  'mysticalmerries',
  'novelTL',
  'novelsparadise',
  'prizmatranslation',
  'requiemtls',
  'sektenovel',
  'sonicmtl',
  'translatinotaku',
  'universalnovel',
  'warriorlegendtrad',
  'wuxialnscantrad',
  'wuxiaworld.site',
]);

const folder = path.join('public', 'static');

const used = new Set([
  path.join(folder, 'coverNotAvailable.webp'),
  path.join(folder, 'siteNotAvailable.png'),
]);

const notAvailableImage = fs.readFileSync(
  path.join(folder, 'siteNotAvailable.png'),
);

(async () => {
  console.log('Loading plugins.json ⌛');
  const plugin_path = path.join('.dist', 'plugins.json');
  if (!fs.existsSync(plugin_path)) {
    console.log(
      '❌',
      plugin_path,
      'not found (run "npm run build:manifest" first)',
    );
    return;
  }
  const plugins = JSON.parse(fs.readFileSync(plugin_path, 'utf-8'));

  console.log('\nDownloading icons ⌛');
  let language;
  for (let plugin in plugins) {
    const { id, name, site, iconUrl, lang, customJS, customCSS } =
      plugins[plugin];
    const icon = iconUrl && path.join(folder, iconUrl.split('/static/')[1]);

    if (language !== lang) {
      language = lang;
      console.log(
        ` ${language} `
          .padStart(Math.floor((language.length + 32) / 2), '=')
          .padEnd(30, '='),
      );
    }

    try {
      if (customJS) {
        used.add(path.join(folder, customJS.split('/static/')[1]));
      }
      if (customCSS) {
        used.add(path.join(folder, customCSS.split('/static/')[1]));
      }
      if (icon) used.add(icon);
      if (!skip.has(id) && icon && site) {
        const image = await fetch(
          `https://www.google.com/s2/favicons?domain=${site}&sz=${size}&type=png`,
        )
          .then(res => res.arrayBuffer())
          .then(res => Buffer.from(res));

        if (Buffer.compare(image, notAvailableImage) === 0) {
          console.log(
            '  ',
            name.padEnd(26),
            `(${id})`.padEnd(20),
            'Is site down?',
            '\r❌',
          );
          continue;
        }

        const imageSize = sizeOf(image);
        const exist = fs.existsSync(icon);

        if (!exist) {
          const dir = path.dirname(icon);
          fs.mkdirSync(dir, { recursive: true });
        }

        if (
          ((imageSize?.width || size) > minSize &&
            (imageSize?.height || size) > minSize) ||
          !exist
        ) {
          fs.writeFileSync(icon, image);
          console.log('  ', name.padEnd(26), `(${id})`, '\r✅');
        } else {
          console.log(
            '  ',
            name.padEnd(26),
            `(${id})`.padEnd(20),
            'Low quality',
            '\r🔄',
          );
        }
      } else {
        console.log('  ', `Skipping ${name}`.padEnd(26), `(${id})`, '\r🔄');
      }
    } catch (err) {
      console.log(
        '  ',
        name.padEnd(26),
        `(${id})`.padEnd(20),
        err instanceof Error ? err.constructor.name : typeof err,
        '\r❌',
      );
      console.log(err);
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
  }
  console.log('\nDeleting unused icons  ⌛');

  fileList(folder).forEach(path => {
    if (!used.has(path)) {
      console.log('🗑️', path);
      fs.rmSync(path, { force: true });
    }
  });
  console.log('\nDone ✅');
})();

function fileList(dir) {
  return fs.readdirSync(dir).reduce((list, file) => {
    const name = path.join(dir, file);
    const isDir = fs.statSync(name).isDirectory();
    return list.concat(isDir ? fileList(name) : [name]);
  }, []);
}
