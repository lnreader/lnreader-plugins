import { minify_sync } from 'terser';
import * as esbuild from 'esbuild';
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
  const bundled = esbuild.buildSync({
    entryPoints: [path.join(REPO_ROOT, 'src/lib/pluginError.ts')],
    bundle: true,
    format: 'iife',
    globalName: '__pluginErrorFallback',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
  }).outputFiles[0].text;

  cachedPluginErrorFallbackHelper = ts.transpileModule(bundled, {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.None,
      removeComments: true,
      alwaysStrict: false,
    },
  }).outputText;

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
