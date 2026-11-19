import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const files = process.argv
  .slice(2)
  .map(f => path.resolve(f))
  .filter(f => {
    const rel = path.relative(process.cwd(), f).replaceAll('\\', '/');
    return !rel.startsWith('plugins/multisrc/') && !rel.endsWith('.broken.ts');
  });

if (files.length === 0) process.exit(0);

const tmpConfig = path.join(
  os.tmpdir(),
  `tsconfig.typecheck-files.${process.pid}.json`,
);
fs.writeFileSync(
  tmpConfig,
  JSON.stringify({
    extends: path.resolve('tsconfig.json'),
    compilerOptions: { noEmit: true },
    include: files,
  }),
);

try {
  execFileSync(
    process.execPath,
    [path.resolve('node_modules/typescript/bin/tsc'), '--project', tmpConfig],
    { stdio: 'inherit' },
  );
} catch (err) {
  process.exitCode = err.status ?? 1;
} finally {
  fs.rmSync(tmpConfig, { force: true });
}
