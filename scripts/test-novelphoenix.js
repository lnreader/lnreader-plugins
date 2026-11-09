// Run offline with: node --test scripts/test-novelphoenix.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

const templateSource = readFileSync(
  new URL('../plugins/multisrc/novelfire/template.ts', import.meta.url),
  'utf8',
);

function makeTranspiledCode(sourceId, sourceName, sourceSite) {
  const pluginScript = `
${templateSource}
const plugin = new NovelFirePlugin({
  id: "${sourceId}",
  sourceSite: "${sourceSite}",
  sourceName: "${sourceName}",
  options: {
    lang: "English",
    versionIncrement: 3
  }
});
exports.plugin = plugin;
export default plugin;
`;
  return ts.transpileModule(pluginScript, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
}

function loadPlugin(code, fetchApi, storageData = {}) {
  const exports = {};
  const stubs = {
    '@libs/fetch': { fetchApi },
    '@libs/storage': {
      storage: {
        get: key => storageData[key],
        set: (key, val) => {
          storageData[key] = val;
        },
      },
    },
    '@libs/filterInputs': { FilterTypes: {} },
    '@libs/novelStatus': { NovelStatus: { Unknown: 'Unknown' } },
    '@/types/constants': { defaultCover: 'https://example.com/default.png' },
  };

  runInNewContext(code, {
    exports,
    require: name => stubs[name] || require(name),
    console,
    URL,
    URLSearchParams,
    Date,
    Math,
    parseInt,
    parseFloat,
    Number,
    isNaN,
    Array,
    Set,
    String,
    RegExp,
  });

  return exports.plugin;
}

test('NovelPhoenix chapter name includes chapter number from AJAX response', async () => {
  const mockAjaxData = {
    draw: 1,
    recordsTotal: 4,
    recordsFiltered: 4,
    data: [
      {
        chapter_id: 1,
        n_sort: 1,
        slug: 'chapter-1-1-nightmare-begins',
        title: 'Nightmare Begins',
      },
      {
        chapter_id: 2,
        n_sort: 2,
        slug: 'chapter-2-2-the-sign',
        title: '– The Sign',
      },
      {
        chapter_id: 3,
        n_sort: 3,
        slug: 'prologue',
        title: 'Prologue',
      },
      {
        chapter_id: 4,
        n_sort: 4,
        slug: '4-the-truth',
        title: '4. The Truth',
      },
    ],
  };

  const fetchApi = async url => {
    if (url.includes('ajax/listChapterDataAjax')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockAjaxData),
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const phoenixCode = makeTranspiledCode(
    'novelphoenix',
    'Novel Phoenix',
    'https://novelphoenix.com/',
  );
  const plugin = loadPlugin(phoenixCode, fetchApi);
  const chapters = await plugin.getAllChapters('novel/test-novel', '100', '1');

  assert.equal(chapters.length, 4);

  assert.equal(chapters[0].name, 'Chapter 1 Nightmare Begins');
  assert.equal(chapters[1].name, 'Chapter 2 The Sign');
  assert.equal(chapters[2].name, 'Chapter 3 Prologue');
  assert.equal(chapters[3].name, '4. The Truth');
});

test('NovelPhoenix fallback HTML parsing handles .chapter-no and .chapter-title without attr title short-circuit', async () => {
  const html = `
    <ul class="chapter-list">
      <li><a href="/novel/test-novel/chapter-1" title="Nightmare Begins"><span class="chapter-no">Ch. 1</span><strong class="chapter-title">Nightmare Begins</strong></a></li>
      <li><a href="/novel/test-novel/chapter-2"><span class="chapter-no">Ch. 2</span><strong class="chapter-title">– The Sign</strong></a></li>
    </ul>
  `;

  const fetchApi = async url => {
    if (url.includes('/chapters?page=1')) {
      return {
        ok: true,
        status: 200,
        text: async () => html,
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const phoenixCode = makeTranspiledCode(
    'novelphoenix',
    'Novel Phoenix',
    'https://novelphoenix.com/',
  );
  const plugin = loadPlugin(phoenixCode, fetchApi, { pageLength: true });
  const result = await plugin.parsePage('novel/test-novel', '1');

  assert.equal(result.chapters.length, 2);
  assert.equal(result.chapters[0].name, 'Ch. 1 Nightmare Begins');
  assert.equal(result.chapters[1].name, 'Ch. 2 The Sign');
});

test('NovelFire chapter name preserves existing Chapter prefix without duplicating', async () => {
  const mockAjaxData = {
    draw: 1,
    recordsTotal: 1,
    recordsFiltered: 1,
    data: [
      {
        chapter_id: 1,
        n_sort: 1,
        slug: 'chapter-1-1-nightmare-begins',
        title: 'Chapter 1 - 1: Nightmare Begins',
      },
    ],
  };

  const fetchApi = async url => {
    if (url.includes('ajax/listChapterDataAjax')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockAjaxData),
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const fireCode = makeTranspiledCode(
    'novelfire',
    'Novel Fire',
    'https://novelfire.net/',
  );
  const plugin = loadPlugin(fireCode, fetchApi);
  const chapters = await plugin.getAllChapters(
    'novel/shadow-slave',
    '2196',
    '1',
  );

  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].name, 'Chapter 1 - 1: Nightmare Begins');
});
