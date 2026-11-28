'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const {
  comparisonValue,
  extractSection,
  nonEmptySectionLines,
  stripDirectional,
} = require('./issue-parsing.cjs');

const REQUEST_PLUGIN_BOUNDARIES = [
  'Plugin Name',
  'Website URL',
  'Language',
  'Other Details',
  'Acknowledgements',
];
const EXEMPT_ASSOCIATIONS = new Set(['owner', 'member', 'collaborator']);
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.36 Safari/537.36';
const PRIVATE_DOMAIN_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.lan',
  '.localdomain',
];
const UNREACHABLE_EXIT_CODES = new Set([6, 7, 28, 35, 52, 56]);
const TLS_CERT_EXIT_CODES = new Set([51, 60]);

function extractWebsiteUrl(body) {
  const section = extractSection(
    body,
    'Website URL',
    REQUEST_PLUGIN_BOUNDARIES,
  );
  const lines = nonEmptySectionLines(section);
  return lines[0] || '';
}

function extractBaseUrl(rawUrl) {
  const trimmed = stripDirectional(rawUrl).trim();
  if (!trimmed || /\s/.test(trimmed)) return '';

  const candidate = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '');
  if (!candidate || candidate.includes('@') || /\s/.test(candidate)) {
    return '';
  }
  if (
    !/^[A-Za-z0-9.-]+\.([A-Za-z]{2,}|xn--[A-Za-z0-9-]{2,})(:[0-9]+)?$/.test(
      candidate,
    )
  ) {
    return '';
  }

  const colonIdx = candidate.lastIndexOf(':');
  const host = colonIdx >= 0 ? candidate.slice(0, colonIdx) : candidate;
  const portStr = colonIdx >= 0 ? candidate.slice(colonIdx + 1) : '';
  if (portStr) {
    const port = Number(portStr);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return '';
    }
  }

  const labels = host.split('.');
  if (
    labels.some(label => !label || label.startsWith('-') || label.endsWith('-'))
  ) {
    return '';
  }

  const lowerHost = host.toLowerCase();
  if (
    lowerHost === 'localhost' ||
    PRIVATE_DOMAIN_SUFFIXES.some(suffix => lowerHost.endsWith(suffix))
  ) {
    return '';
  }

  return portStr ? `${lowerHost}:${portStr}` : lowerHost;
}

function isPrivateIp(ip) {
  if (typeof ip !== 'string') return true;
  let cleaned = ip.trim().toLowerCase();
  if (!cleaned) return true;

  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1);
  }
  const zoneIdx = cleaned.indexOf('%');
  if (zoneIdx >= 0) {
    cleaned = cleaned.slice(0, zoneIdx);
  }
  if (!cleaned) return true;

  if (cleaned.includes(':')) {
    if (cleaned.startsWith('::ffff:')) {
      const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(cleaned);
      return mapped ? isPrivateIp(mapped[1]) : true;
    }
    return (
      cleaned === '::' ||
      cleaned === '::1' ||
      cleaned === '0:0:0:0:0:0:0:0' ||
      cleaned === '0:0:0:0:0:0:0:1' ||
      /^fc|^fd|^fe[89ab]|^ff/.test(cleaned)
    );
  }

  const parts = cleaned.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) {
    return true;
  }
  const octets = parts.map(Number);
  if (octets.some(octet => octet < 0 || octet > 255)) {
    return true;
  }
  const [o1, o2] = octets;
  if (o1 === 0 || o1 === 10 || o1 === 127) return true;
  if (o1 === 169 && o2 === 254) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  if (o1 === 192 && o2 === 168) return true;
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  if (o1 >= 224) return true;
  return false;
}

function probeUrlWithCurl(
  url,
  { userAgent, connectTimeoutSec = 8, maxTimeSec = 12, maxRedirs = 5 } = {},
) {
  const args = [
    '--location',
    '--max-redirs',
    String(maxRedirs),
    '--proto',
    '=http,https',
    '--proto-redir',
    '=http,https',
    '--silent',
    '--output',
    '/dev/null',
    '--connect-timeout',
    String(connectTimeoutSec),
    '--max-time',
    String(maxTimeSec),
    '-H',
    `User-Agent: ${userAgent || DEFAULT_USER_AGENT}`,
    '-w',
    '%{http_code}\t%{exitcode}\t%{remote_ip}\t%{errormsg}',
    '--',
    url,
  ];

  let stdout = '';
  let processExitCode = 0;
  try {
    stdout = execFileSync('curl', args, {
      encoding: 'utf8',
      timeout: (maxTimeSec + 5) * 1000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        url,
        httpCode: 0,
        exitCode: -1,
        remoteIp: '',
        error: err.message || 'curl unavailable',
        spawnError: true,
      };
    }
    stdout = (err && typeof err.stdout === 'string' && err.stdout) || '';
    processExitCode = err && typeof err.status === 'number' ? err.status : -1;
    if (!stdout && processExitCode === -1) {
      return {
        url,
        httpCode: 0,
        exitCode: -1,
        remoteIp: '',
        error: (err && err.message) || 'curl execution failed',
        spawnError: true,
      };
    }
  }

  const [codeStr = '0', exitStr = '', remoteIp = '', ...errParts] =
    stdout.split('\t');
  const httpCode = /^\d{3}$/.test(codeStr.trim()) ? Number(codeStr.trim()) : 0;
  const exitCode = /^\d+$/.test(exitStr.trim())
    ? Number(exitStr.trim())
    : processExitCode;
  const error = errParts.join('\t').trim();

  return {
    url,
    httpCode,
    exitCode,
    remoteIp: remoteIp.trim(),
    error,
    spawnError: false,
  };
}

function classifyFailureReason(attempts) {
  const codes = attempts.map(attempt => attempt.exitCode);
  if (codes.length > 0 && codes.every(code => code === 6)) {
    return 'DNS resolution failed (the domain could not be resolved).';
  }
  if (codes.includes(28)) {
    return 'Connection timed out with no HTTP response.';
  }
  if (codes.includes(7)) {
    return 'Connection refused or host unreachable.';
  }
  if (codes.includes(52) || codes.includes(56)) {
    return 'Connection was closed or reset without an HTTP response.';
  }
  if (codes.includes(35)) {
    return 'TLS/SSL handshake failed and HTTP did not respond.';
  }
  return 'No HTTP response received over HTTPS or HTTP.';
}

async function checkSiteReachability(
  baseUrl,
  {
    rawUrl = '',
    userAgent = DEFAULT_USER_AGENT,
    probeUrl = probeUrlWithCurl,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    maxAttempts = 2,
    retryDelayMs = 3000,
    connectTimeoutSec = 8,
    maxTimeSec = 12,
  } = {},
) {
  const schemes = /^http:\/\//i.test(String(rawUrl || '').trim())
    ? ['http', 'https']
    : ['https', 'http'];
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const scheme of schemes) {
      const result = await probeUrl(`${scheme}://${baseUrl}/`, {
        userAgent,
        connectTimeoutSec,
        maxTimeSec,
      });
      attempts.push(result);

      if (result.spawnError) {
        return {
          status: 'error',
          failureReason: result.error || 'curl unavailable',
          attempts,
        };
      }
      if (result.remoteIp && isPrivateIp(result.remoteIp)) {
        return {
          status: 'blocked_private_ip',
          failureReason: 'Resolved to a private or loopback IP address',
          attempts,
        };
      }
      if (result.httpCode >= 100 && result.httpCode <= 599) {
        return {
          status: 'reachable',
          httpCode: result.httpCode,
          url: result.url,
          attempts,
        };
      }
    }

    if (attempt < maxAttempts && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  if (attempts.some(attempt => TLS_CERT_EXIT_CODES.has(attempt.exitCode))) {
    return {
      status: 'tls_cert_error',
      failureReason: 'TLS certificate verification failed',
      attempts,
    };
  }

  if (attempts.some(attempt => !UNREACHABLE_EXIT_CODES.has(attempt.exitCode))) {
    return {
      status: 'error',
      failureReason: 'Unexpected probe error',
      attempts,
    };
  }

  return {
    status: 'unreachable',
    failureReason: classifyFailureReason(attempts),
    attempts,
  };
}

function isValidAuthor(author) {
  return (
    typeof author === 'string' &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(author)
  );
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

function normalizeLabelNames(labels) {
  return new Set(
    (Array.isArray(labels) ? labels : [])
      .map(label => (typeof label === 'string' ? label : label && label.name))
      .filter(label => typeof label === 'string')
      .map(comparisonValue)
      .filter(Boolean),
  );
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

  if (
    EXEMPT_ASSOCIATIONS.has(comparisonValue(authorAssociation)) ||
    comparisonValue(authorType) === 'bot'
  ) {
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

  if (!reachability || reachability.status === 'reachable') {
    return makeDecision();
  }

  if (reachability.status === 'blocked_private_ip') {
    return makeDecision({ skipped: 'private-ip' });
  }

  if (reachability.status === 'tls_cert_error') {
    return makeDecision({ skipped: 'tls-cert-error' });
  }

  if (reachability.status !== 'unreachable') {
    return makeDecision({ skipped: 'probe-error' });
  }

  return makeDecision({ shouldClose: true });
}

function confirmCloseWithCurrentIssue(siteCheckResult, currentIssue) {
  if (!siteCheckResult || !siteCheckResult.shouldClose) {
    return {
      shouldClose: false,
      skipped: (siteCheckResult && siteCheckResult.skipped) || 'not-closable',
      label: '',
      comment: '',
    };
  }

  if (
    !currentIssue ||
    typeof currentIssue !== 'object' ||
    Array.isArray(currentIssue) ||
    Object.hasOwn(currentIssue, 'pull_request')
  ) {
    return {
      shouldClose: false,
      skipped: 'invalid-issue',
      label: '',
      comment: '',
    };
  }

  if (comparisonValue(currentIssue.state) !== 'open') {
    return {
      shouldClose: false,
      skipped: 'already-closed',
      label: '',
      comment: '',
    };
  }

  if (!normalizeLabelNames(currentIssue.labels).has('plugin request')) {
    return {
      shouldClose: false,
      skipped: 'label-removed',
      label: '',
      comment: '',
    };
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

function parseJsonOrDefault(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
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
  const userAgent = process.env.USER_AGENT || DEFAULT_USER_AGENT;

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
};
