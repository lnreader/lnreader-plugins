import fs from 'fs';
import { execSync } from 'child_process';

let content = `import { Plugin } from '@/types/plugin';\n`;
let pluginCounter = 0;
const PLUGIN_DIR = 'plugins';

fs.readdirSync(PLUGIN_DIR)
  .filter(f => !f.includes('index') && f !== 'multisrc')
  .forEach(langName => {
    const LANG_DIR = PLUGIN_DIR + '/' + langName;
    fs.readdirSync(LANG_DIR)
      .filter(f => !f.includes('broken') && !f.startsWith('.'))
      .forEach(pluginName => {
        content += `import p_${pluginCounter} from '@plugins/${langName}/${pluginName.replace(/\.ts$/, '')}';\n`;
        pluginCounter += 1;
      });
  });

content += `\nconst PLUGINS: Plugin.PluginBase[] = [${Array(pluginCounter)
  .fill()
  .map((v, index) => 'p_' + index.toString())
  .join(', ')}];\nexport default PLUGINS`;

const outputPath = './plugins/index.ts';
fs.writeFileSync(outputPath, content, { encoding: 'utf-8' });

execSync(`npx prettier --write ${outputPath}`, { stdio: 'inherit' });
