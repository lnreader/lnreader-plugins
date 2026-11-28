'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildIssueIndex,
  updateIssueIndex,
} = require('./generate-issue-index.cjs');

const pluginKeys = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'keys.json'), 'utf8'),
);

test('buildIssueIndex resolves English, Chinese comma keys, Arabic LRM keys, and severity codes', () => {
  const issues = [
    {
      number: 101,
      state: 'open',
      labels: [{ name: 'bug' }],
      body: [
        '### Plugin',
        '',
        'English: Novel Fire, 中文, 汉语, 漢語: 69书吧',
        '',
        '### Severity',
        '',
        "Can't Load Novels",
      ].join('\n'),
    },
    {
      number: 102,
      state: 'open',
      labels: [{ name: 'bug' }],
      body: [
        '### Plugin',
        '',
        '\u200eالعربية: ArNovel',
        '',
        '### Severity',
        '',
        'Wrong Formatting',
      ].join('\n'),
    },
    {
      number: 103,
      state: 'closed',
      labels: [{ name: 'bug' }],
      body: '### Plugin\n\nEnglish: Novel Fire\n\n### Severity\n\nOther',
    },
    {
      number: 104,
      state: 'open',
      pull_request: {},
      labels: [],
      body: '### Plugin\n\nEnglish: Novel Fire\n\n### Severity\n\nOther',
    },
  ];

  const warnings = [];
  assert.deepEqual(
    buildIssueIndex(issues, pluginKeys, msg => warnings.push(msg)),
    {
      '69shu': [[5, 101]],
      arnovel: [[1, 102]],
      novelfire: [[5, 101]],
    },
  );
  assert.deepEqual(warnings, []);
});

test('updateIssueIndex adds, updates, and removes open issues cleanly', () => {
  const warnings = [];
  const warn = msg => warnings.push(msg);

  const initial = buildIssueIndex(
    [
      {
        number: 201,
        state: 'open',
        labels: [{ name: 'bug' }],
        body: '### Plugin\n\nEnglish: Novel Fire\n\n### Severity\n\nMissing Chapter',
      },
    ],
    pluginKeys,
    warn,
  );

  const updated = updateIssueIndex(
    initial,
    201,
    {
      number: 201,
      state: 'open',
      labels: [{ name: 'bug' }],
      body: '### Plugin\n\nEnglish: Novel Fire\n\n### Severity\n\nDomain Changed',
    },
    pluginKeys,
    warn,
  );
  assert.deepEqual(updated, { novelfire: [[6, 201]] });

  const removed = updateIssueIndex(updated, 201, null, pluginKeys, warn);
  assert.deepEqual(removed, {});
  assert.deepEqual(warnings, []);
});
