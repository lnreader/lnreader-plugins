'use strict';

const fs = require('node:fs');
const os = require('node:os');
const {
  EXEMPT_ASSOCIATIONS,
  TEMPLATE_BOUNDARIES,
  comparisonValue,
  extractSection,
  isExemptAuthor,
  isValidAuthor,
  nonEmptySectionLines,
  normalizeLabelNames,
  parseJsonOrDefault,
} = require('./issue-parsing.cjs');
const {
  DEFAULT_USER_AGENT,
  MANAGED_THEME_LABELS,
  PRIVATE_DOMAIN_SUFFIXES,
  TLS_CERT_EXIT_CODES,
  UNREACHABLE_EXIT_CODES,
  checkLiveIssueGuard,
  checkSiteReachability,
  detectWebsiteThemes,
  extractBaseUrl,
  fetchLatestUserAgent,
  isPrivateIp,
  probeUrlWithCurl,
  reachabilitySkipReason,
} = require('./site-reachability.cjs');

const REQUEST_PLUGIN_BOUNDARIES = TEMPLATE_BOUNDARIES.requestPlugin;

function extractWebsiteUrl(body) {
  const section = extractSection(
    body,
    'Website URL',
    REQUEST_PLUGIN_BOUNDARIES,
  );
  const lines = nonEmptySectionLines(section);
  return lines[0] || '';
}

function buildUnreachableComment({ author, baseUrl, failureReason }) {
  const mention = isValidAuthor(author) ? `@${author} ` : '';
  return [
    `${mention}this plugin request was automatically closed because the submitted website (\`${baseUrl}\`) did not respond when checked over HTTPS and HTTP:`,
    '',
    `- ${failureReason}`,
    '',
    'Please verify the Website URL for typos or a domain change and open a new request with a working URL.',
    '',
    '*If the website is online (for example, region-restricted or geo-blocked from GitHub Actions runners) and you believe this was closed in error, please comment below so a maintainer can review and reopen it.*',
  ].join('\n');
}

function evaluatePluginRequestSite({
  body = '',
  previousBody = null,
  action = '',
  labels = [],
  author = '',
  authorAssociation = '',
  authorType = '',
  state = 'open',
  reachability = null,
} = {}) {
  const url = extractWebsiteUrl(body);
  const baseUrl = extractBaseUrl(url);
  const reachable = Boolean(
    reachability && reachability.status === 'reachable',
  );

  function makeDecision({ shouldClose = false, skipped = null } = {}) {
    return {
      url,
      baseUrl,
      reachable,
      reachability,
      shouldClose,
      skipped,
      label: shouldClose ? 'invalid' : '',
      comment: shouldClose
        ? buildUnreachableComment({
            author,
            baseUrl,
            failureReason: reachability.failureReason,
          })
        : '',
    };
  }

  if (comparisonValue(state) !== 'open') {
    return makeDecision({ skipped: 'not-open' });
  }

  if (isExemptAuthor({ authorAssociation, authorType })) {
    return makeDecision({ skipped: 'exempt-author' });
  }

  if (!normalizeLabelNames(labels).has('plugin request')) {
    return makeDecision({ skipped: 'missing-label' });
  }

  if (!baseUrl) {
    return makeDecision({ skipped: 'invalid-or-missing-url' });
  }

  if (comparisonValue(action) === 'edited') {
    if (
      typeof previousBody !== 'string' ||
      extractBaseUrl(extractWebsiteUrl(previousBody)) === baseUrl
    ) {
      return makeDecision({ skipped: 'url-unchanged' });
    }
  }

  if (!reachability) {
    return makeDecision();
  }

  const skipReason = reachabilitySkipReason(reachability.status);
  if (skipReason) {
    return makeDecision({ skipped: skipReason });
  }

  if (reachability.status === 'reachable') {
    return makeDecision();
  }

  return makeDecision({ shouldClose: true });
}

function confirmCloseWithCurrentIssue(siteCheckResult, currentIssue) {
  const guard = checkLiveIssueGuard(
    siteCheckResult,
    currentIssue,
    'plugin request',
  );
  if (!guard.ok) {
    return guard.decision;
  }

  const currentBaseUrl = extractBaseUrl(
    extractWebsiteUrl(currentIssue.body || ''),
  );
  if (currentBaseUrl !== siteCheckResult.baseUrl) {
    return {
      shouldClose: false,
      skipped: 'url-changed-during-check',
      label: '',
      comment: '',
    };
  }

  return {
    shouldClose: true,
    skipped: null,
    label: siteCheckResult.label,
    comment: siteCheckResult.comment,
  };
}

function computeThemeLabelPlan({
  detection = null,
  existingLabels = [],
  resolvedThemeLabel = '',
} = {}) {
  const desiredLabel =
    detection && detection.matchCount === 1
      ? resolvedThemeLabel || detection.themeLabel || ''
      : '';
  const normalizedDesired = comparisonValue(desiredLabel);
  const rawExisting = (
    Array.isArray(existingLabels) ? existingLabels : []
  ).filter(label => typeof label === 'string');
  const normalizedExisting = normalizeLabelNames(rawExisting);

  const add =
    desiredLabel && !normalizedExisting.has(normalizedDesired)
      ? [desiredLabel]
      : [];

  const remove = [];
  const seenRemove = new Set();
  for (const label of rawExisting) {
    const normalized = comparisonValue(label);
    if (
      !normalized ||
      !MANAGED_THEME_LABELS.has(normalized) ||
      normalized === normalizedDesired ||
      seenRemove.has(normalized)
    ) {
      continue;
    }
    seenRemove.add(normalized);
    remove.push(label);
  }

  return { desiredLabel, add, remove };
}

async function runCli(argv = process.argv.slice(2)) {
  if (argv[0] === '--extract-url') {
    const url = extractWebsiteUrl(process.env.ISSUE_BODY || '');
    const baseUrl = extractBaseUrl(url);
    process.stdout.write(`${JSON.stringify({ url, baseUrl })}\n`);
    return;
  }

  if (argv[0] === '--confirm-close') {
    const [, siteCheckPath, currentIssuePath] = argv;
    if (!siteCheckPath || !currentIssuePath) {
      throw new Error(
        'Usage: --confirm-close <siteCheckPath> <currentIssuePath>',
      );
    }
    const siteCheckResult = JSON.parse(fs.readFileSync(siteCheckPath, 'utf8'));
    const currentIssue = JSON.parse(fs.readFileSync(currentIssuePath, 'utf8'));
    const decision = confirmCloseWithCurrentIssue(
      siteCheckResult,
      currentIssue,
    );
    process.stdout.write(`${JSON.stringify(decision)}\n`);
    return;
  }

  if (argv[0] === '--detect-theme') {
    const baseUrl = extractBaseUrl(process.env.BASE_URL || '');
    if (!baseUrl) {
      process.stdout.write(
        `${JSON.stringify({ matched: [], matchCount: 0, themeLabel: '', checks: [] })}\n`,
      );
      return;
    }
    const userAgent = process.env.USER_AGENT || (await fetchLatestUserAgent());
    const result = await detectWebsiteThemes(baseUrl, {
      userAgent,
      tempDir: process.env.RUNNER_TEMP || os.tmpdir(),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (argv[0] === '--plan-theme-labels') {
    const [, detectJsonPath, liveLabelsJsonPath] = argv;
    if (!detectJsonPath || !liveLabelsJsonPath) {
      throw new Error(
        'Usage: --plan-theme-labels <detectJsonPath> <liveLabelsJsonPath>',
      );
    }
    const detection = JSON.parse(fs.readFileSync(detectJsonPath, 'utf8'));
    const existingLabels = JSON.parse(
      fs.readFileSync(liveLabelsJsonPath, 'utf8'),
    );
    const plan = computeThemeLabelPlan({
      detection,
      existingLabels,
      resolvedThemeLabel: process.env.RESOLVED_THEME_LABEL || '',
    });
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return;
  }

  const body = process.env.ISSUE_BODY || '';
  const previousBody = parseJsonOrDefault(
    process.env.PREVIOUS_ISSUE_BODY_JSON,
    null,
  );
  const action = process.env.EVENT_ACTION || '';
  const labels = parseJsonOrDefault(process.env.ISSUE_LABELS, []);
  const author = process.env.ISSUE_AUTHOR || '';
  const authorAssociation = process.env.ISSUE_AUTHOR_ASSOCIATION || '';
  const authorType = process.env.ISSUE_AUTHOR_TYPE || '';
  const state = process.env.ISSUE_STATE || 'open';
  const userAgent = process.env.USER_AGENT || (await fetchLatestUserAgent());

  const url = extractWebsiteUrl(body);
  const baseUrl = extractBaseUrl(url);
  const reachability = baseUrl
    ? await checkSiteReachability(baseUrl, { rawUrl: url, userAgent })
    : null;

  const result = evaluatePluginRequestSite({
    body,
    previousBody,
    action,
    labels,
    author,
    authorAssociation,
    authorType,
    state,
    reachability,
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  runCli().catch(err => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  REQUEST_PLUGIN_BOUNDARIES,
  EXEMPT_ASSOCIATIONS,
  DEFAULT_USER_AGENT,
  PRIVATE_DOMAIN_SUFFIXES,
  UNREACHABLE_EXIT_CODES,
  TLS_CERT_EXIT_CODES,
  extractWebsiteUrl,
  extractBaseUrl,
  isPrivateIp,
  probeUrlWithCurl,
  checkSiteReachability,
  buildUnreachableComment,
  evaluatePluginRequestSite,
  confirmCloseWithCurrentIssue,
  computeThemeLabelPlan,
};
