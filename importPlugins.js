import path from 'path';
import fs from 'fs';

let content = `import { Plugin } from '@typings/plugin';\n`;
let pluginCounter = 0;
const PLUGIN_DIR = 'src/plugins';

fs.readdirSync(PLUGIN_DIR)
  .filter(f => !f.includes('index'))
  .forEach(langName => {
    const LANG_DIR = PLUGIN_DIR + '/' + langName;
    fs.readdirSync(LANG_DIR)
      .filter(f => !f.includes('broken') && !f.startsWith('.'))
      .forEach(pluginName => {
        content += `import p_${pluginCounter} from './${langName}/${pluginName.replace(/\.ts$/, '')}';\n`;
        pluginCounter += 1;
      });
  });

content += `\nconst PLUGINS: Plugin.PluginBase[] = [${Array(pluginCounter)
  .fill()
  .map((v, index) => 'p_' + index.toString())
  .join(', ')}];\nexport default PLUGINS`;

fs.writeFileSync('./src/plugins/index.ts', content, { encoding: 'utf-8' });
