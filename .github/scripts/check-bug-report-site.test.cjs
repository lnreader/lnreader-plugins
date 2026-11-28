'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  confirmBugCloseWithCurrentIssue,
  evaluateBugReportSite,
  extractCandidateNewUrls,
  loadPluginSites,
  matchReportedPlugins,
} = require('./check-bug-report-site.cjs');

const SCRIPT_PATH = path.join(__dirname, 'check-bug-report-site.cjs');
const KEYS_PATH = path.join(__dirname, 'keys.json');
const PLUGIN_KEYS = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
const PLUGIN_SITES = loadPluginSites();

function makeBugReportBody({
  plugin = 'English: Novel7s',
  severity = "Can't Load Novels",
  steps = '1. Open plugin\n2. Error appears',
  expected = 'Should load novels',
  actual = 'Failed to fetch',
  otherDetails = '_No response_',
} = {}) {
  return [
    '### Plugin',
    '',
    plugin,
    '',
    '### Severity',
    '',
    severity,
    '',
    '### Steps To Reproduce',
    '',
    steps,
    '',
    '### Expected Behavior',
    '',
    expected,
    '',
    '### Actual Behavior',
    '',
    actual,
    '',
    '### LNReader Version',
    '',
    '2.1.4',
    '',
    '### Plugin Version',
    '',
    '1.0.0',
    '',
    '### Android Version',
    '',
    'Android 15',
    '',
    '### Other Details',
    '',
    otherDetails,
    '',
    '### Acknowledgements',
    '',
    '- [x] I have searched existing issues and confirmed this is not a duplicate.',
  ].join('\n');
}

test('loadPluginSites resolves all keys.json plugins except dynamic self-hosted komga', () => {
  const ids = [...new Set(Object.values(PLUGIN_KEYS))];
  const unresolved = ids.filter(id => !PLUGIN_SITES.has(id.toLowerCase()));
  assert.deepEqual(unresolved, ['komga']);

  assert.equal(PLUGIN_SITES.get('novel7s').baseUrl, 'novel7s.com');
  assert.equal(PLUGIN_SITES.get('lewenn').baseUrl, 'www.lewenn.com');
  assert.equal(
    PLUGIN_SITES.get('novelmania.com.br').baseUrl,
    'novelmania.com.br',
  );
  assert.equal(PLUGIN_SITES.get('grensia').baseUrl, 'grensia.blogspot.com');
  assert.equal(
    PLUGIN_SITES.get('maddertranslates').baseUrl,
    'www.maddertranslates.com',
  );
  assert.equal(
    PLUGIN_SITES.get('noveltranslations18').baseUrl,
    'noveltranslations18.blogspot.com',
  );
  assert.equal(PLUGIN_SITES.get('daoistquest').baseUrl, 'daoist.quest');
  assert.equal(PLUGIN_SITES.get('hotnovelpub').baseUrl, 'hotnovelpub.com');
});

test('matchReportedPlugins matches English, CJK comma keys, Arabic LRM keys, colons, and multi-select', () => {
  const matched = matchReportedPlugins(
    makeBugReportBody({
      plugin:
        'English: Re:Library, 中文, 汉语, 漢語: 69书吧, \u200eالعربية: Kol Novel',
    }),
    PLUGIN_KEYS,
  );
  assert.deepEqual(
    matched.map(item => item.id),
    ['ReLib', '69shu', 'kolnovel'],
  );
  assert.equal(matched[0].name, 'Re:Library');
});

test('extractCandidateNewUrls extracts new URLs, ignores old/meta/screenshots, and avoids false-positive bare tokens', () => {
  const explicitBody = makeBugReportBody({
    plugin: 'English: Belle Reservoir',
    severity: 'Domain Changed',
    steps: '1. Open plugin',
    expected:
      'The domain should change from https://bellereservoir.com/ to https://bellerepository.com/',
    actual:
      'See screenshot <img src="https://github.com/user-attachments/assets/abc-123" /> and ![err](https://imgur.com/xyz.png). Also discussed on https://discord.gg/lnreader.',
  });
  assert.deepEqual(
    extractCandidateNewUrls(explicitBody, ['bellereservoir.com']),
    [
      {
        rawUrl: 'https://bellerepository.com/',
        baseUrl: 'bellerepository.com',
      },
    ],
  );

  const bareDomainBody = makeBugReportBody({
    plugin: 'English: Ranobes',
    severity: 'Domain Changed',
    steps: 'Novelarrow change into novelping.com',
    expected: 'Shift from ranobes.net to ranobes.top',
    actual:
      'App package com.rajarsheechatterjee.LNReader failed. Do not click.to open or help.me or log.in.',
  });
  assert.deepEqual(extractCandidateNewUrls(bareDomainBody, ['ranobes.net']), [
    { rawUrl: 'https://novelping.com', baseUrl: 'novelping.com' },
    { rawUrl: 'https://ranobes.top', baseUrl: 'ranobes.top' },
  ]);

  const screenshotOnlyBody = makeBugReportBody({
    plugin: 'English: Dragonholic',
    severity: 'Domain Changed',
    actual:
      'On webview the site states it had its domain changed.\n<img src="https://github.com/user-attachments/assets/def-456" />',
  });
  assert.deepEqual(
    extractCandidateNewUrls(screenshotOnlyBody, ['dragonholic.com']),
    [],
  );
});

test('evaluateBugReportSite closes unreachable bug reports with website-owner & domain-change guidance', async () => {
  const body = makeBugReportBody({
    plugin: 'English: Novel7s',
    severity: "Can't Load Novels",
  });

  const unreachableResult = await evaluateBugReportSite({
    body,
    action: 'opened',
    labels: ['bug'],
    author: 'reader1',
    repository: 'LNReader/lnreader-plugins',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason:
            'DNS resolution failed (the domain could not be resolved).',
          attempts: [],
        },
      })),
  });

  assert.equal(unreachableResult.mode, 'bug');
  assert.equal(unreachableResult.shouldClose, true);
  assert.equal(unreachableResult.label, 'invalid');
  assert.match(unreachableResult.comment, /^@reader1 /);
  assert.match(unreachableResult.comment, /\*\*Novel7s\*\* \(`novel7s\.com`\)/);
  assert.match(unreachableResult.comment, /website owner's official channels/);
  assert.match(unreachableResult.comment, /\*\*Domain Changed\*\*/);
  assert.match(
    unreachableResult.comment,
    /https:\/\/github\.com\/LNReader\/lnreader-plugins\/issues\/new\?template=report_issue\.yml/,
  );
  assert.match(unreachableResult.comment, /geo-blocked/);

  const reachableResult = await evaluateBugReportSite({
    body,
    action: 'opened',
    labels: ['bug'],
    author: 'reader1',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: { status: 'reachable', httpCode: 403, attempts: [] },
      })),
  });
  assert.equal(reachableResult.shouldClose, false);
  assert.equal(reachableResult.reachable, true);
});

test('evaluateBugReportSite handles multi-plugin reports, komga, guardrails, and edited issues', async () => {
  const multiBody = makeBugReportBody({
    plugin: 'English: Novel7s, English: Daoist Quest',
  });

  // 1 unreachable + 1 reachable -> keep open
  const partialReachable = await evaluateBugReportSite({
    body: multiBody,
    labels: ['bug'],
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets => [
      {
        label: targets[0].label,
        baseUrl: targets[0].baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason: 'Connection timed out with no HTTP response.',
          attempts: [],
        },
      },
      {
        label: targets[1].label,
        baseUrl: targets[1].baseUrl,
        reachability: { status: 'reachable', httpCode: 200, attempts: [] },
      },
    ],
  });
  assert.equal(partialReachable.shouldClose, false);
  assert.equal(partialReachable.reachable, true);

  // All unreachable -> close listing both plugins
  const allUnreachable = await evaluateBugReportSite({
    body: multiBody,
    labels: ['bug'],
    author: 'reader1',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason: 'Connection refused or host unreachable.',
          attempts: [],
        },
      })),
  });
  assert.equal(allUnreachable.shouldClose, true);
  assert.match(allUnreachable.comment, /\*\*Novel7s\*\* \(`novel7s\.com`\)/);
  assert.match(
    allUnreachable.comment,
    /\*\*Daoist Quest\*\* \(`daoist\.quest`\)/,
  );

  // komga must never be probed
  let probed = false;
  const komgaRes = await evaluateBugReportSite({
    body: makeBugReportBody({ plugin: 'Multi: Komga' }),
    labels: ['bug'],
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async () => {
      probed = true;
      return [];
    },
  });
  assert.equal(probed, false);
  assert.equal(komgaRes.shouldClose, false);
  assert.equal(komgaRes.skipped, 'plugin-site-unresolved');

  // Guardrails
  assert.equal(
    (
      await evaluateBugReportSite({
        body: makeBugReportBody(),
        labels: ['bug'],
        state: 'closed',
        pluginKeys: PLUGIN_KEYS,
        pluginSites: PLUGIN_SITES,
      })
    ).skipped,
    'not-open',
  );
  assert.equal(
    (
      await evaluateBugReportSite({
        body: makeBugReportBody(),
        labels: ['bug'],
        authorAssociation: 'MEMBER',
        pluginKeys: PLUGIN_KEYS,
        pluginSites: PLUGIN_SITES,
      })
    ).skipped,
    'exempt-author',
  );
  assert.equal(
    (
      await evaluateBugReportSite({
        body: makeBugReportBody(),
        labels: ['plugin request'],
        pluginKeys: PLUGIN_KEYS,
        pluginSites: PLUGIN_SITES,
      })
    ).skipped,
    'missing-label',
  );
  assert.equal(
    (
      await evaluateBugReportSite({
        body: makeBugReportBody({ plugin: 'English: Unknown Plugin' }),
        labels: ['bug'],
        pluginKeys: PLUGIN_KEYS,
        pluginSites: PLUGIN_SITES,
      })
    ).skipped,
    'no-matched-plugin',
  );
  assert.equal(
    (
      await evaluateBugReportSite({
        body: makeBugReportBody({
          plugin:
            'English: Novel7s, English: Daoist Quest, English: HotNovelPub, English: Ranobes, English: Novel Bin, English: BoxNovel',
        }),
        labels: ['bug'],
        pluginKeys: PLUGIN_KEYS,
        pluginSites: PLUGIN_SITES,
      })
    ).skipped,
    'too-many-targets',
  );

  // Edit guard: unchanged plugin/severity skips; changed plugin probes and closes
  assert.equal(
    (
      await evaluateBugReportSite({
        body: makeBugReportBody({ plugin: 'English: Novel7s' }),
        previousBody: makeBugReportBody({
          plugin: 'English: Novel7s',
          actual: 'Edited typo in description',
        }),
        action: 'edited',
        labels: ['bug'],
        pluginKeys: PLUGIN_KEYS,
        pluginSites: PLUGIN_SITES,
      })
    ).skipped,
    'target-unchanged',
  );

  const editedPlugin = await evaluateBugReportSite({
    body: makeBugReportBody({ plugin: 'English: Daoist Quest' }),
    previousBody: makeBugReportBody({ plugin: 'English: Novel7s' }),
    action: 'edited',
    labels: ['bug'],
    author: 'reader1',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason: 'Connection timed out with no HTTP response.',
          attempts: [],
        },
      })),
  });
  assert.equal(editedPlugin.shouldClose, true);

  for (const [status, expectedSkip] of [
    ['blocked_private_ip', 'private-ip'],
    ['tls_cert_error', 'tls-cert-error'],
    ['error', 'probe-error'],
  ]) {
    const res = await evaluateBugReportSite({
      body: makeBugReportBody(),
      labels: ['bug'],
      pluginKeys: PLUGIN_KEYS,
      pluginSites: PLUGIN_SITES,
      probeTargets: async targets => [
        {
          label: targets[0].label,
          baseUrl: targets[0].baseUrl,
          reachability: { status, failureReason: 'x', attempts: [] },
        },
      ],
    });
    assert.equal(res.shouldClose, false);
    assert.equal(res.skipped, expectedSkip);
  }
});

test('evaluateBugReportSite checks candidate new URLs for Domain Changed reports', async () => {
  const domainChangeBody = makeBugReportBody({
    plugin: 'English: Belle Reservoir',
    severity: 'Domain Changed',
    expected: 'Change to https://bellerepository.example/',
  });

  const checkedTargets = [];
  const deadNewDomain = await evaluateBugReportSite({
    body: domainChangeBody,
    action: 'opened',
    labels: ['bug', 'severity: domain changed'],
    author: 'reader2',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets => {
      checkedTargets.push(...targets.map(t => t.baseUrl));
      return targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason:
            'DNS resolution failed (the domain could not be resolved).',
          attempts: [],
        },
      }));
    },
  });

  assert.deepEqual(checkedTargets, ['bellerepository.example']);
  assert.equal(deadNewDomain.mode, 'domain-changed');
  assert.equal(deadNewDomain.shouldClose, true);
  assert.equal(deadNewDomain.label, 'invalid');
  assert.match(deadNewDomain.comment, /^@reader2 /);
  assert.match(
    deadNewDomain.comment,
    /domain change report was automatically closed/,
  );
  assert.match(deadNewDomain.comment, /`bellerepository\.example`/);

  const liveNewDomain = await evaluateBugReportSite({
    body: domainChangeBody,
    action: 'opened',
    labels: ['bug'],
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: { status: 'reachable', httpCode: 200, attempts: [] },
      })),
  });
  assert.equal(liveNewDomain.shouldClose, false);
  assert.equal(liveNewDomain.reachable, true);

  const noNewUrl = await evaluateBugReportSite({
    body: makeBugReportBody({
      plugin: 'English: Belle Reservoir',
      severity: 'Domain Changed',
      expected: 'Please update domain',
      actual: 'Old domain is dead',
    }),
    labels: ['bug'],
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
  });
  assert.equal(noNewUrl.shouldClose, false);
  assert.equal(noNewUrl.skipped, 'no-new-url');

  // Edit guard for Domain Changed
  assert.equal(
    (
      await evaluateBugReportSite({
        body: domainChangeBody,
        previousBody: domainChangeBody,
        action: 'edited',
        labels: ['bug', 'severity: domain changed'],
        pluginKeys: PLUGIN_KEYS,
        pluginSites: PLUGIN_SITES,
      })
    ).skipped,
    'target-unchanged',
  );

  const editedDomainChange = await evaluateBugReportSite({
    body: makeBugReportBody({
      plugin: 'English: Belle Reservoir',
      severity: 'Domain Changed',
      expected: 'Change to https://new-dead.example/',
    }),
    previousBody: domainChangeBody,
    action: 'edited',
    labels: ['bug', 'severity: domain changed'],
    author: 'reader2',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason: 'Connection timed out with no HTTP response.',
          attempts: [],
        },
      })),
  });
  assert.equal(editedDomainChange.shouldClose, true);
});

test('confirmBugCloseWithCurrentIssue aborts when live issue changes before close', async () => {
  const checkResult = await evaluateBugReportSite({
    body: makeBugReportBody({ plugin: 'English: Novel7s' }),
    labels: ['bug'],
    author: 'reader1',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason: 'Connection refused or host unreachable.',
          attempts: [],
        },
      })),
  });

  const approved = confirmBugCloseWithCurrentIssue(
    checkResult,
    {
      state: 'open',
      labels: [{ name: 'bug' }, { name: "severity: can't load novels" }],
      body: makeBugReportBody({ plugin: 'English: Novel7s' }),
    },
    { pluginKeys: PLUGIN_KEYS, pluginSites: PLUGIN_SITES },
  );
  assert.equal(approved.shouldClose, true);
  assert.equal(approved.label, 'invalid');

  assert.equal(
    confirmBugCloseWithCurrentIssue(
      checkResult,
      {
        state: 'closed',
        labels: [{ name: 'bug' }],
        body: makeBugReportBody({ plugin: 'English: Novel7s' }),
      },
      { pluginKeys: PLUGIN_KEYS, pluginSites: PLUGIN_SITES },
    ).skipped,
    'already-closed',
  );

  assert.equal(
    confirmBugCloseWithCurrentIssue(
      checkResult,
      {
        state: 'open',
        labels: [{ name: 'plugin request' }],
        body: makeBugReportBody({ plugin: 'English: Novel7s' }),
      },
      { pluginKeys: PLUGIN_KEYS, pluginSites: PLUGIN_SITES },
    ).skipped,
    'label-removed',
  );

  assert.equal(
    confirmBugCloseWithCurrentIssue(
      checkResult,
      {
        state: 'open',
        labels: [{ name: 'bug' }],
        body: makeBugReportBody({
          plugin: 'English: Novel7s',
          severity: 'Domain Changed',
          expected: 'Move to https://novel7s.org',
        }),
      },
      { pluginKeys: PLUGIN_KEYS, pluginSites: PLUGIN_SITES },
    ).skipped,
    'target-changed-during-check',
  );
});

test('CLI supports --confirm-close cleanly', async () => {
  const checkResult = await evaluateBugReportSite({
    body: makeBugReportBody({ plugin: 'English: Novel7s' }),
    labels: ['bug'],
    author: 'reader1',
    repository: 'LNReader/lnreader-plugins',
    pluginKeys: PLUGIN_KEYS,
    pluginSites: PLUGIN_SITES,
    probeTargets: async targets =>
      targets.map(target => ({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability: {
          status: 'unreachable',
          failureReason: 'Connection timed out with no HTTP response.',
          attempts: [],
        },
      })),
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bug-site-cli-'));
  try {
    const checkPath = path.join(tmpDir, 'check.json');
    const issuePath = path.join(tmpDir, 'issue.json');
    fs.writeFileSync(checkPath, JSON.stringify(checkResult));
    fs.writeFileSync(
      issuePath,
      JSON.stringify({
        state: 'open',
        labels: [{ name: 'bug' }],
        body: makeBugReportBody({ plugin: 'English: Novel7s' }),
      }),
    );

    const out = execFileSync(
      process.execPath,
      [SCRIPT_PATH, '--confirm-close', checkPath, issuePath],
      { encoding: 'utf8' },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.shouldClose, true);
    assert.equal(parsed.label, 'invalid');
    assert.match(parsed.comment, /@reader1/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
