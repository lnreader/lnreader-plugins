import fs from 'fs';

const src = '.js/plugins';
const dest = '.js/src/plugins';

// Mirror the compiled output to the legacy path that the manifest points to,
// matching what scripts/publish-plugins.{sh,ps1} do in production.
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync('.js/src', { recursive: true });
fs.cpSync(src, dest, { recursive: true, force: true });

console.log(`Copied ${src} -> ${dest}`);
