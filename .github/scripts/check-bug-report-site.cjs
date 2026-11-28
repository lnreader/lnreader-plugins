'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  TEMPLATE_BOUNDARIES,
  comparisonValue,
  extractSection,
  isExemptAuthor,
  isValidAuthor,
  isValidRepository,
  matchPluginEntries,
  nonEmptySectionLines,
  normalizeLabelNames,
  parseJsonOrDefault,
  stripDirectional,
} = require('./issue-parsing.cjs');
const {
  DEFAULT_USER_AGENT,
  checkLiveIssueGuard,
  checkSiteReachability,
  extractBaseUrl,
  fetchLatestUserAgent,
  reachabilitySkipReason,
} = require('./site-reachability.cjs');

const REPORT_ISSUE_BOUNDARIES = TEMPLATE_BOUNDARIES.reportIssue;

const DOMAIN_CHANGE_SECTIONS = [
  'Steps To Reproduce',
  'Expected Behavior',
  'Actual Behavior',
  'Other Details',
];

const MAX_TARGETS_TO_CHECK = 5;

const IGNORED_META_DOMAINS = new Set([
  'github.com',
  'githubusercontent.com',
  'gist.github.com',
  'imgur.com',
  'discord.com',
  'discord.gg',
  'discordapp.com',
  'discordapp.net',
  'reddit.com',
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
  't.me',
  'play.google.com',
  'postimg.cc',
  'ibb.co',
  'example.com',
  'example.org',
  'example.net',
]);

const SHARED_HOST_SUFFIXES = new Set([
  'wordpress.com',
  'blogspot.com',
  'github.io',
  'netlify.app',
  'pages.dev',
  'vercel.app',
  'web.app',
  'firebaseapp.com',
  'herokuapp.com',
  'fandom.com',
  'neocities.org',
  'tumblr.com',
  'wixsite.com',
  'weebly.com',
  'substack.com',
]);

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'com.br',
  'com.au',
  'co.jp',
  'co.id',
  'my.id',
  'com.cn',
  'com.tw',
  'com.vn',
  'com.tr',
  'com.mx',
  'com.ar',
  'co.kr',
]);

const UNAMBIGUOUS_BARE_TLDS = new Set([
  'com',
  'net',
  'org',
  'xyz',
  'site',
  'online',
  'top',
  'vip',
  'club',
  'info',
  'io',
  'cc',
  'icu',
  'cyou',
  'sbs',
  'lat',
  'buzz',
  'moe',
  'fun',
  'space',
  'world',
  'live',
  'blog',
  'shop',
  'store',
  'wiki',
  'pro',
  'ru',
  'fr',
  'vn',
  'br',
  'tr',
  'pl',
  'de',
  'uk',
  'jp',
  'kr',
  'cn',
  'tw',
  'ua',
  'es',
]);

function extractStandalonePluginSite(text) {
  const consts = new Map();
  const constRegex =
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*['"`]([^'"`\n]+)['"`]/gm;
  let constMatch;
  while ((constMatch = constRegex.exec(text)) !== null) {
    consts.set(constMatch[1], constMatch[2]);
  }

  const idMatch =
    /^\s*(?:public\s+|readonly\s+)*id\s*(?::[^=\n]+)?=\s*['"`]([^'"`\n]+)['"`]/m.exec(
      text,
    );
  if (!idMatch) return null;

  const siteLiteral =
    /^\s*(?:public\s+|readonly\s+)*site\s*(?::[^=\n]+)?=\s*(?:['"](https?:\/\/[^'"\n]+)['"]|`(https?:\/\/[^`$\n]+)`)/m.exec(
      text,
    );
  let site = siteLiteral ? siteLiteral[1] || siteLiteral[2] : '';

  if (!site) {
    const siteConst =
      /^\s*(?:public\s+|readonly\s+)*site\s*(?::[^=\n]+)?=\s*([A-Za-z_$][\w$]*)\s*;?/m.exec(
        text,
      );
    if (siteConst && consts.has(siteConst[1])) {
      site = consts.get(siteConst[1]);
    }
  }

  if (!site) {
    const siteTemplate =
      /^\s*(?:public\s+|readonly\s+)*site\s*(?::[^=\n]+)?=\s*`([^`\n$]*)\$\{([A-Za-z_$][\w$]*)\}([^`\n]*)`/m.exec(
        text,
      );
    if (siteTemplate && consts.has(siteTemplate[2])) {
      site = `${siteTemplate[1]}${consts.get(siteTemplate[2])}${siteTemplate[3]}`;
    }
  }

  return { id: idMatch[1], site };
}

function loadPluginSites(
  pluginsDir = path.resolve(__dirname, '../../plugins'),
) {
  const sitesById = new Map();
  if (!fs.existsSync(pluginsDir)) return sitesById;

  const multisrcDir = path.join(pluginsDir, 'multisrc');
  if (fs.existsSync(multisrcDir)) {
    for (const entry of fs.readdirSync(multisrcDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourcesPath = path.join(multisrcDir, entry.name, 'sources.json');
      if (!fs.existsSync(sourcesPath)) continue;
      const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
      if (!Array.isArray(sources)) continue;
      for (const item of sources) {
        if (
          !item ||
          typeof item.id !== 'string' ||
          typeof item.sourceSite !== 'string'
        ) {
          continue;
        }
        const baseUrl = extractBaseUrl(item.sourceSite);
        if (!baseUrl) continue;
        sitesById.set(comparisonValue(item.id), {
          id: item.id,
          site: item.sourceSite,
          baseUrl,
        });
      }
    }
  }

  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'multisrc') continue;
    const langDir = path.join(pluginsDir, entry.name);
    for (const file of fs.readdirSync(langDir)) {
      if (!file.endsWith('.ts') || file.endsWith('.broken.ts')) continue;
      const text = fs.readFileSync(path.join(langDir, file), 'utf8');
      const parsed = extractStandalonePluginSite(text);
      if (!parsed || !parsed.site) continue;
      const baseUrl = extractBaseUrl(parsed.site);
      if (!baseUrl) continue;
      sitesById.set(comparisonValue(parsed.id), {
        id: parsed.id,
        site: parsed.site,
        baseUrl,
      });
    }
  }

  return sitesById;
}

function matchReportedPlugins(body, pluginKeys) {
  const section = extractSection(body, 'Plugin', REPORT_ISSUE_BOUNDARIES);
  const lines = nonEmptySectionLines(section);
  return matchPluginEntries(lines, pluginKeys);
}

function isDomainChangedReport(body, labels = []) {
  const severitySection = extractSection(
    body,
    'Severity',
    REPORT_ISSUE_BOUNDARIES,
  );
  const severityLines = nonEmptySectionLines(severitySection);
  if (
    severityLines.length > 0 &&
    comparisonValue(severityLines[0]) === 'domain changed'
  ) {
    return true;
  }
  const normalizedLabels = normalizeLabelNames(labels);
  return (
    normalizedLabels.has('domain changed') ||
    normalizedLabels.has('severity: domain changed')
  );
}

function stripWww(baseUrl) {
  return String(baseUrl || '')
    .split(':')[0]
    .toLowerCase()
    .replace(/^www\./, '');
}

function isIgnoredMetaDomain(baseUrl) {
  const host = String(baseUrl || '')
    .split(':')[0]
    .toLowerCase();
  if (!host) return true;
  for (const domain of IGNORED_META_DOMAINS) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

function isExcludedOldHost(candidateHost, excludedHosts) {
  if (!candidateHost) return true;
  if (excludedHosts.has(candidateHost)) return true;
  if (
    SHARED_HOST_SUFFIXES.has(candidateHost) ||
    MULTI_PART_PUBLIC_SUFFIXES.has(candidateHost)
  ) {
    return false;
  }
  for (const oldHost of excludedHosts) {
    if (oldHost.endsWith(`.${candidateHost}`)) {
      return true;
    }
  }
  return false;
}

function extractCandidateNewUrls(body, excludedBaseUrls = []) {
  const excludedHosts = new Set(excludedBaseUrls.map(stripWww).filter(Boolean));

  const sanitizedSections = [];
  for (const heading of DOMAIN_CHANGE_SECTIONS) {
    const section = extractSection(body, heading, REPORT_ISSUE_BOUNDARIES);
    const lines = nonEmptySectionLines(section);
    if (lines.length === 0) continue;
    const text = lines
      .join('\n')
      .replace(/<img\b[^>]*>/gi, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
    sanitizedSections.push(text);
  }

  if (sanitizedSections.length === 0) return [];
  const combined = sanitizedSections.join('\n');

  const candidates = [];
  const seenBaseUrls = new Set();

  const tryAddCandidate = rawUrl => {
    const baseUrl = extractBaseUrl(rawUrl);
    if (!baseUrl) return;
    if (isIgnoredMetaDomain(baseUrl)) return;
    if (isExcludedOldHost(stripWww(baseUrl), excludedHosts)) return;
    if (seenBaseUrls.has(baseUrl)) return;
    seenBaseUrls.add(baseUrl);
    candidates.push({ rawUrl, baseUrl });
  };

  const explicitUrlRegex = /https?:\/\/[^\s<>'"`)\]]+/gi;
  const bareScanText = combined.replace(explicitUrlRegex, match => {
    const cleaned = match.replace(/[.,;:!?'"`)\]]+$/, '');
    tryAddCandidate(cleaned);
    return ' ';
  });

  const bareDomainRegex =
    /(?<![@/.A-Za-z0-9_-])([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)(?![.\w])/g;
  let bareMatch;
  while ((bareMatch = bareDomainRegex.exec(bareScanText)) !== null) {
    const token = bareMatch[1];
    const tld = token.split('.').pop().toLowerCase();
    if (!UNAMBIGUOUS_BARE_TLDS.has(tld)) continue;
    const baseUrl = extractBaseUrl(token);
    if (!baseUrl) continue;
    tryAddCandidate(`https://${baseUrl}`);
  }

  return candidates;
}

function resolveBugCheckTargets({
  body = '',
  labels = [],
  pluginKeys = {},
  pluginSites = new Map(),
} = {}) {
  const matchedPlugins = matchReportedPlugins(body, pluginKeys);
  const domainChanged = isDomainChangedReport(body, labels);

  if (domainChanged) {
    const excludedBaseUrls = matchedPlugins
      .map(plugin => {
        const entry = pluginSites.get(comparisonValue(plugin.id));
        return entry ? entry.baseUrl : '';
      })
      .filter(Boolean);
    const candidates = extractCandidateNewUrls(body, excludedBaseUrls);
    return {
      mode: 'domain-changed',
      matchedPlugins,
      targets: candidates.map(candidate => ({
        label: candidate.baseUrl,
        rawUrl: candidate.rawUrl,
        baseUrl: candidate.baseUrl,
      })),
      unresolvedPlugins: [],
    };
  }

  const targets = [];
  const seenBaseUrls = new Set();
  const unresolvedPlugins = [];

  for (const plugin of matchedPlugins) {
    const entry = pluginSites.get(comparisonValue(plugin.id));
    if (!entry || !entry.baseUrl) {
      unresolvedPlugins.push(plugin);
      continue;
    }
    if (seenBaseUrls.has(entry.baseUrl)) continue;
    seenBaseUrls.add(entry.baseUrl);
    targets.push({
      label: plugin.name,
      pluginId: plugin.id,
      rawUrl: entry.site,
      baseUrl: entry.baseUrl,
    });
  }

  return {
    mode: 'bug',
    matchedPlugins,
    targets,
    unresolvedPlugins,
  };
}

function buildUnreachableBugComment({ author, repository, targetResults }) {
  const mention = isValidAuthor(author) ? `@${author} ` : '';
  const reportLink = isValidRepository(repository)
    ? `[Report Issue](https://github.com/${repository}/issues/new?template=report_issue.yml)`
    : 'Report Issue';

  const headerAndList =
    targetResults.length === 1
      ? [
          `${mention}this issue was automatically closed because the website for **${targetResults[0].label}** (\`${targetResults[0].baseUrl}\`) did not respond when checked over HTTPS and HTTP:`,
          '',
          `- ${targetResults[0].reachability.failureReason}`,
        ]
      : [
          `${mention}this issue was automatically closed because the website(s) for the reported plugin(s) did not respond when checked over HTTPS and HTTP:`,
          '',
          ...targetResults.map(
            item =>
              `- **${item.label}** (\`${item.baseUrl}\`): ${item.reachability.failureReason}`,
          ),
        ];

  return [
    ...headerAndList,
    '',
    "This appears to be an issue on the website's side rather than the plugin itself. Please contact or check the website owner's official channels (such as their announcements, Discord, or social media) for status information.",
    '',
    `If the website has changed its URL or domain, please open a new ${reportLink} with **Severity** set to **Domain Changed** and include the new working URL.`,
    '',
    '*If the website is online (for example, region-restricted or geo-blocked from GitHub Actions runners) and you believe this was closed in error, please comment below so a maintainer can review and reopen it.*',
  ].join('\n');
}

function buildUnreachableDomainChangeComment({ author, targetResults }) {
  const mention = isValidAuthor(author) ? `@${author} ` : '';

  const headerAndList =
    targetResults.length === 1
      ? [
          `${mention}this domain change report was automatically closed because the submitted new website URL (\`${targetResults[0].baseUrl}\`) did not respond when checked over HTTPS and HTTP:`,
          '',
          `- ${targetResults[0].reachability.failureReason}`,
        ]
      : [
          `${mention}this domain change report was automatically closed because none of the submitted new website URLs responded when checked over HTTPS and HTTP:`,
          '',
          ...targetResults.map(
            item => `- \`${item.baseUrl}\`: ${item.reachability.failureReason}`,
          ),
        ];

  return [
    ...headerAndList,
    '',
    'Please verify that the new URL is spelled correctly and currently online, then open a new issue with the working URL.',
    '',
    '*If the new website is online (for example, region-restricted or geo-blocked from GitHub Actions runners) and you believe this was closed in error, please comment below so a maintainer can review and reopen it.*',
  ].join('\n');
}

function sortedBaseUrls(targets) {
  return [...targets.map(target => target.baseUrl)].sort();
}

async function evaluateBugReportSite({
  body = '',
  previousBody = null,
  action = '',
  labels = [],
  author = '',
  authorAssociation = '',
  authorType = '',
  state = 'open',
  repository = '',
  userAgent = DEFAULT_USER_AGENT,
  pluginKeys = {},
  pluginSites = new Map(),
  probeTargets = null,
} = {}) {
  const resolved = resolveBugCheckTargets({
    body,
    labels,
    pluginKeys,
    pluginSites,
  });

  function makeDecision({
    targetResults = [],
    reachable = false,
    shouldClose = false,
    skipped = null,
  } = {}) {
    let comment = '';
    if (shouldClose) {
      comment =
        resolved.mode === 'domain-changed'
          ? buildUnreachableDomainChangeComment({ author, targetResults })
          : buildUnreachableBugComment({ author, repository, targetResults });
    }
    return {
      mode: resolved.mode,
      targets: resolved.targets.map(target => target.baseUrl),
      targetResults,
      reachable,
      shouldClose,
      skipped,
      label: shouldClose ? 'invalid' : '',
      comment,
    };
  }

  if (comparisonValue(state) !== 'open') {
    return makeDecision({ skipped: 'not-open' });
  }

  if (isExemptAuthor({ authorAssociation, authorType })) {
    return makeDecision({ skipped: 'exempt-author' });
  }

  if (!normalizeLabelNames(labels).has('bug')) {
    return makeDecision({ skipped: 'missing-label' });
  }

  if (resolved.mode === 'bug') {
    if (resolved.matchedPlugins.length === 0) {
      return makeDecision({ skipped: 'no-matched-plugin' });
    }
    if (resolved.unresolvedPlugins.length > 0) {
      return makeDecision({ skipped: 'plugin-site-unresolved' });
    }
    if (resolved.targets.length === 0) {
      return makeDecision({ skipped: 'no-targets' });
    }
  } else if (resolved.targets.length === 0) {
    return makeDecision({ skipped: 'no-new-url' });
  }

  if (resolved.targets.length > MAX_TARGETS_TO_CHECK) {
    return makeDecision({ skipped: 'too-many-targets' });
  }

  if (comparisonValue(action) === 'edited') {
    if (typeof previousBody !== 'string') {
      return makeDecision({ skipped: 'target-unchanged' });
    }
    const prevBodyMode = isDomainChangedReport(previousBody, [])
      ? 'domain-changed'
      : 'bug';
    const currBodyMode = isDomainChangedReport(body, [])
      ? 'domain-changed'
      : 'bug';
    const prevResolved = resolveBugCheckTargets({
      body: previousBody,
      labels: prevBodyMode === 'domain-changed' ? ['domain changed'] : [],
      pluginKeys,
      pluginSites,
    });
    const sameTargets =
      prevBodyMode === currBodyMode &&
      prevResolved.mode === resolved.mode &&
      JSON.stringify(sortedBaseUrls(prevResolved.targets)) ===
        JSON.stringify(sortedBaseUrls(resolved.targets));
    if (sameTargets) {
      return makeDecision({ skipped: 'target-unchanged' });
    }
  }

  const targetResults = [];
  if (typeof probeTargets === 'function') {
    const results = await probeTargets(resolved.targets);
    if (Array.isArray(results)) {
      targetResults.push(...results);
    }
  } else {
    for (const target of resolved.targets) {
      const reachability = await checkSiteReachability(target.baseUrl, {
        rawUrl: target.rawUrl,
        userAgent,
      });
      targetResults.push({
        label: target.label,
        baseUrl: target.baseUrl,
        reachability,
      });
      if (reachability.status !== 'unreachable') {
        break;
      }
    }
  }

  if (
    targetResults.length === 0 ||
    targetResults.some(
      item => item.reachability && item.reachability.status === 'reachable',
    )
  ) {
    return makeDecision({ targetResults, reachable: true });
  }

  const nonReachableSkip = targetResults
    .map(item =>
      reachabilitySkipReason(item.reachability && item.reachability.status),
    )
    .find(Boolean);
  if (nonReachableSkip) {
    return makeDecision({ targetResults, skipped: nonReachableSkip });
  }

  return makeDecision({ targetResults, shouldClose: true });
}

function confirmBugCloseWithCurrentIssue(
  checkResult,
  currentIssue,
  { pluginKeys = {}, pluginSites = new Map() } = {},
) {
  const guard = checkLiveIssueGuard(checkResult, currentIssue, 'bug');
  if (!guard.ok) {
    return guard.decision;
  }

  const liveResolved = resolveBugCheckTargets({
    body: currentIssue.body || '',
    labels: currentIssue.labels || [],
    pluginKeys,
    pluginSites,
  });

  if (
    liveResolved.mode === 'bug' &&
    (liveResolved.unresolvedPlugins.length > 0 ||
      liveResolved.targets.length === 0)
  ) {
    return {
      shouldClose: false,
      skipped: 'target-changed-during-check',
      label: '',
      comment: '',
    };
  }

  const expectedTargets = [...(checkResult.targets || [])].sort();
  const liveTargets = sortedBaseUrls(liveResolved.targets);

  if (
    liveResolved.mode !== checkResult.mode ||
    JSON.stringify(liveTargets) !== JSON.stringify(expectedTargets)
  ) {
    return {
      shouldClose: false,
      skipped: 'target-changed-during-check',
      label: '',
      comment: '',
    };
  }

  return {
    shouldClose: true,
    skipped: null,
    label: checkResult.label,
    comment: checkResult.comment,
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const keysPath = path.join(__dirname, 'keys.json');
  const pluginKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  const pluginSites = loadPluginSites();

  if (argv[0] === '--confirm-close') {
    const [, checkJsonPath, currentIssueJsonPath] = argv;
    if (!checkJsonPath || !currentIssueJsonPath) {
      throw new Error(
        'Usage: --confirm-close <checkJsonPath> <currentIssueJsonPath>',
      );
    }
    const checkResult = JSON.parse(fs.readFileSync(checkJsonPath, 'utf8'));
    const currentIssue = JSON.parse(
      fs.readFileSync(currentIssueJsonPath, 'utf8'),
    );
    const decision = confirmBugCloseWithCurrentIssue(
      checkResult,
      currentIssue,
      { pluginKeys, pluginSites },
    );
    process.stdout.write(`${JSON.stringify(decision)}\n`);
    return;
  }

  const userAgent = process.env.USER_AGENT || (await fetchLatestUserAgent());

  const result = await evaluateBugReportSite({
    body: process.env.ISSUE_BODY || '',
    previousBody: parseJsonOrDefault(
      process.env.PREVIOUS_ISSUE_BODY_JSON,
      null,
    ),
    action: process.env.EVENT_ACTION || '',
    labels: parseJsonOrDefault(process.env.ISSUE_LABELS, []),
    author: process.env.ISSUE_AUTHOR || '',
    authorAssociation: process.env.ISSUE_AUTHOR_ASSOCIATION || '',
    authorType: process.env.ISSUE_AUTHOR_TYPE || '',
    state: process.env.ISSUE_STATE || 'open',
    repository: process.env.REPOSITORY || '',
    userAgent,
    pluginKeys,
    pluginSites,
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  runCli().catch(err => {
    process.stderr.write(`${stripDirectional(err.message)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  REPORT_ISSUE_BOUNDARIES,
  DOMAIN_CHANGE_SECTIONS,
  MAX_TARGETS_TO_CHECK,
  IGNORED_META_DOMAINS,
  SHARED_HOST_SUFFIXES,
  MULTI_PART_PUBLIC_SUFFIXES,
  UNAMBIGUOUS_BARE_TLDS,
  extractStandalonePluginSite,
  loadPluginSites,
  matchReportedPlugins,
  isDomainChangedReport,
  extractCandidateNewUrls,
  resolveBugCheckTargets,
  buildUnreachableBugComment,
  buildUnreachableDomainChangeComment,
  evaluateBugReportSite,
  confirmBugCloseWithCurrentIssue,
};
