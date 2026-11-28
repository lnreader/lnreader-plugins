'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  renderIssueTemplate,
} = require('./generate-issue-template-options.cjs');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SCRIPTS_DIR = path.join(ROOT_DIR, '.github', 'scripts');
const WORKFLOWS_DIR = path.join(ROOT_DIR, '.github', 'workflows');

function run(cmd, args, label) {
  process.stdout.write(`\n=== ${label} ===\n`);
  execFileSync(cmd, args, { cwd: ROOT_DIR, stdio: 'inherit' });
}

function hasActionlint() {
  try {
    execFileSync('actionlint', ['-version'], {
      cwd: ROOT_DIR,
      stdio: 'ignore',
    });
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

function main() {
  const requireActionlint = process.argv.includes('--require-actionlint');
  const scriptEntries = fs.readdirSync(SCRIPTS_DIR).sort();
  const cjsFiles = scriptEntries
    .filter(name => name.endsWith('.cjs'))
    .map(name => path.join('.github', 'scripts', name));
  const testFiles = cjsFiles.filter(file => file.endsWith('.test.cjs'));

  run(process.execPath, ['--test', ...testFiles], 'GitHub Script Tests');

  const prettierBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'prettier');
  const eslintBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'eslint');
  run(prettierBin, ['--check', ...cjsFiles], 'Prettier Check');
  run(eslintBin, ['--max-warnings', '0', ...cjsFiles], 'ESLint Check');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lnreader-gh-check-'));
  try {
    const blank = fs.readFileSync(
      path.join(SCRIPTS_DIR, 'blank_report_issue.yml'),
      'utf8',
    );
    const keys = Object.keys(
      JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, 'keys.json'), 'utf8')),
    );
    const renderedPath = path.join(tmpDir, 'rendered-report-issue.yml');
    fs.writeFileSync(renderedPath, renderIssueTemplate(blank, keys));

    run(
      'python3',
      [
        path.join('.github', 'scripts', 'validate-github-yaml.py'),
        '--rendered-report',
        renderedPath,
      ],
      'YAML & Issue Form Validation',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (!hasActionlint()) {
    if (requireActionlint) {
      throw new Error('actionlint is required but was not found on PATH.');
    }
    process.stdout.write(
      '\n=== actionlint ===\nSkipped (actionlint binary not found on PATH).\n',
    );
    return;
  }

  const workflowFiles = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map(name => path.join('.github', 'workflows', name));
  const standardWorkflows = workflowFiles.filter(
    file => path.basename(file) !== 'publish-plugins.yml',
  );

  if (standardWorkflows.length > 0) {
    run(
      'actionlint',
      [
        '-ignore',
        'unexpected key "queue" for "concurrency" section',
        '-ignore',
        'avoid using deprecated input "fail_on_error" in action "reviewdog/action-eslint@v1"',
        ...standardWorkflows,
      ],
      'actionlint',
    );
  }

  const publishWorkflow = path.join(
    '.github',
    'workflows',
    'publish-plugins.yml',
  );
  if (fs.existsSync(path.join(ROOT_DIR, publishWorkflow))) {
    run(
      'actionlint',
      [
        '-ignore',
        'SC2086:info:1:29: Double quote to prevent globbing and word splitting',
        publishWorkflow,
      ],
      'actionlint (publish-plugins.yml)',
    );
  }
}

main();
