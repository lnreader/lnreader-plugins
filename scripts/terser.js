import { minify_sync } from 'terser';
import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const config = {
  compress: {
    arrows: false,
  },
  mangle: {},
  ecma: 5, // specify one of: 5, 2015, 2016, etc.
  enclose: false, // or specify true, or "args:values"
  module: true,
  toplevel: true,
};

const PLUGIN_ERROR_REQUIRE_RE = /require\(\s*["']@libs\/pluginError["']\s*\)/g;
const PLUGIN_ERROR_INJECTED_RE =
  /require\(\s*["']@libs\/pluginError["']\s*\)\s*\|\|/;

let cachedPluginErrorFallbackHelper;

function getPluginErrorFallbackHelper() {
  if (cachedPluginErrorFallbackHelper) {
    return cachedPluginErrorFallbackHelper;
  }
  const constantsSource = fs.readFileSync(
    path.join(REPO_ROOT, 'src/types/constants.ts'),
    'utf8',
  );
  const pluginErrorSource = fs
    .readFileSync(path.join(REPO_ROOT, 'src/lib/pluginError.ts'), 'utf8')
    .replace(
      /^\s*import\s+\{\s*PluginError\s*\}\s+from\s+['"]\.\.\/types\/constants['"];?\r?\n?/m,
      '',
    );
  const combinedSource = `${constantsSource}\n${pluginErrorSource}`;

  const transpiled = ts.transpileModule(combinedSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      removeComments: true,
      alwaysStrict: false,
    },
  }).outputText;

  cachedPluginErrorFallbackHelper = `var __pluginErrorFallback = (function () {\nvar exports = {};\n${transpiled}\nreturn exports;\n})();`;

  return cachedPluginErrorFallbackHelper;
}

function injectPluginErrorFallback(code) {
  PLUGIN_ERROR_REQUIRE_RE.lastIndex = 0;
  if (
    code.indexOf('__pluginErrorFallback') !== -1 ||
    PLUGIN_ERROR_INJECTED_RE.test(code) ||
    !PLUGIN_ERROR_REQUIRE_RE.test(code)
  ) {
    return code;
  }
  PLUGIN_ERROR_REQUIRE_RE.lastIndex = 0;
  const helper = getPluginErrorFallbackHelper();
  const rewritten = code.replace(
    PLUGIN_ERROR_REQUIRE_RE,
    '(require("@libs/pluginError")||__pluginErrorFallback)',
  );
  if (/^["']use strict["'];?/.test(rewritten)) {
    return rewritten.replace(/^(["']use strict["'];?)/, `$1\n${helper}\n`);
  }
  return `${helper}\n${rewritten}`;
}

const minify = function (filePath) {
  const code = injectPluginErrorFallback(fs.readFileSync(filePath).toString());
  const result = minify_sync(code, config);
  fs.writeFileSync(filePath, result.code);
};

export { minify };
