'use strict';

const dns = require('node:dns');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const {
  comparisonValue,
  normalizeLabelNames,
  stripDirectional,
} = require('./issue-parsing.cjs');

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
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_ADDRESSES_PER_HOP = 4;
const REACHABILITY_SKIP_REASONS = Object.freeze({
  blocked_private_ip: 'private-ip',
  tls_cert_error: 'tls-cert-error',
});

const THEME_PROBES = [
  {
    name: 'Madara',
    label: 'theme: madara',
    subdomain: '',
    mode: 'head',
    path: '/wp-content/themes/madara/style.css',
    expectedCt: 'text/css',
  },
  {
    name: 'Lightnovelwp',
    label: 'theme: lightnovelwp',
    subdomain: '',
    mode: 'head',
    path: '/wp-content/themes/lightnovel/style.css',
    expectedCt: 'text/css',
  },
  {
    name: 'HotNovelPub',
    label: 'theme: hotnovelpub',
    subdomain: 'api.',
    mode: 'body',
    path: '',
    pattern: 'Hello!',
    fileName: 'hotnovelpub.txt',
  },
  {
    name: 'Fictioneer',
    label: 'theme: fictioneer',
    subdomain: '',
    mode: 'head',
    path: '/wp-content/themes/fictioneer/css/application.css',
    expectedCt: 'text/css',
  },
  {
    name: 'Novel Fire',
    label: 'theme: novel fire',
    subdomain: '',
    mode: 'head',
    path: '/frontend/js/appsettings.min.js',
    expectedCt: 'javascript',
  },
  {
    name: 'Readwn',
    label: 'theme: readwn',
    subdomain: '',
    mode: 'body',
    path: '/list/all/all-newstime-0.html',
    pattern: 'novel-item',
    fileName: 'readwn.html',
  },
];

const MANAGED_THEME_LABELS = new Set([
  ...THEME_PROBES.map(probe => probe.label),
  'theme: lighnovelwp',
]);

function reachabilitySkipReason(status) {
  if (status === 'reachable' || status === 'unreachable') return null;
  return REACHABILITY_SKIP_REASONS[status] || 'probe-error';
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

async function resolvePublicIps(
  hostname,
  {
    lookup = dns.promises.lookup,
    allowPrivateIp = false,
    maxAddresses = MAX_ADDRESSES_PER_HOP,
  } = {},
) {
  const normalizedHost = String(hostname || '')
    .replace(/^\[|\]$/g, '')
    .trim();
  if (!normalizedHost) {
    return {
      ok: false,
      blockedPrivateIp: true,
      remoteIp: '',
      error: 'Empty hostname',
    };
  }

  if (net.isIP(normalizedHost)) {
    if (!allowPrivateIp && isPrivateIp(normalizedHost)) {
      return {
        ok: false,
        blockedPrivateIp: true,
        remoteIp: normalizedHost,
        error: 'Resolved to a private or loopback IP address',
      };
    }
    return { ok: true, ip: normalizedHost, ips: [normalizedHost] };
  }

  let records;
  try {
    records = await lookup(normalizedHost, { all: true });
  } catch (err) {
    return {
      ok: false,
      blockedPrivateIp: false,
      exitCode: 6,
      remoteIp: '',
      error:
        (err && err.message) || `Could not resolve host: ${normalizedHost}`,
    };
  }

  if (!Array.isArray(records) || records.length === 0) {
    return {
      ok: false,
      blockedPrivateIp: false,
      exitCode: 6,
      remoteIp: '',
      error: `No DNS records found for ${normalizedHost}`,
    };
  }

  if (!allowPrivateIp) {
    for (const record of records) {
      if (record && isPrivateIp(record.address)) {
        return {
          ok: false,
          blockedPrivateIp: true,
          remoteIp: record.address,
          error: 'Resolved to a private or loopback IP address',
        };
      }
    }
  }

  const ipv4 = [];
  const ipv6 = [];
  const seen = new Set();
  for (const record of records) {
    const address =
      record && typeof record.address === 'string' ? record.address.trim() : '';
    if (!address || seen.has(address)) continue;
    seen.add(address);
    if (record.family === 4 || net.isIPv4(address)) {
      ipv4.push(address);
    } else {
      ipv6.push(address);
    }
  }

  const ips = [...ipv4, ...ipv6].slice(0, Math.max(1, maxAddresses));
  if (ips.length === 0) {
    return {
      ok: false,
      blockedPrivateIp: false,
      exitCode: 6,
      remoteIp: '',
      error: `No usable DNS records found for ${normalizedHost}`,
    };
  }

  return { ok: true, ip: ips[0], ips };
}

async function resolvePublicIp(hostname, options) {
  return resolvePublicIps(hostname, options);
}

function runCurlRequest(args, timeoutMs) {
  return new Promise(resolve => {
    execFile(
      'curl',
      args,
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => {
        if (!err) {
          resolve({
            stdout: stdout || '',
            processExitCode: 0,
            spawnError: false,
            error: '',
          });
          return;
        }
        if (err.code === 'ENOENT') {
          resolve({
            stdout: '',
            processExitCode: -1,
            spawnError: true,
            error: err.message || 'curl unavailable',
          });
          return;
        }
        const out = typeof stdout === 'string' ? stdout : '';
        const processExitCode = typeof err.code === 'number' ? err.code : -1;
        if (!out && processExitCode === -1) {
          resolve({
            stdout: '',
            processExitCode: -1,
            spawnError: true,
            error: err.message || 'curl execution failed',
          });
          return;
        }
        resolve({
          stdout: out,
          processExitCode,
          spawnError: false,
          error: err.message || '',
        });
      },
    );
  });
}

async function probeUrlWithCurl(
  url,
  {
    userAgent,
    connectTimeoutSec = 8,
    maxTimeSec = 12,
    maxRedirs = 5,
    headOnly = false,
    maxFilesize = 0,
    outputFile = '/dev/null',
    lookup = dns.promises.lookup,
    execCurl = runCurlRequest,
    allowPrivateIp = false,
  } = {},
) {
  let currentUrl = String(url || '').trim();

  for (let hop = 0; hop <= maxRedirs; hop += 1) {
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return {
        url: currentUrl,
        httpCode: 0,
        exitCode: 3,
        remoteIp: '',
        contentType: '',
        error: 'Invalid URL',
        blockedPrivateIp: false,
        spawnError: false,
      };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        url: currentUrl,
        httpCode: 0,
        exitCode: 1,
        remoteIp: '',
        contentType: '',
        error: 'Unsupported protocol',
        blockedPrivateIp: false,
        spawnError: false,
      };
    }

    const rawHostname = parsed.hostname.replace(/^\[|\]$/g, '');
    if (
      !allowPrivateIp &&
      !net.isIP(rawHostname) &&
      !extractBaseUrl(parsed.host)
    ) {
      return {
        url: currentUrl,
        httpCode: 0,
        exitCode: 0,
        remoteIp: '',
        contentType: '',
        error: 'Blocked private or local domain',
        blockedPrivateIp: true,
        spawnError: false,
      };
    }

    const resolved = await resolvePublicIps(rawHostname, {
      lookup,
      allowPrivateIp,
    });
    if (!resolved.ok) {
      return {
        url: currentUrl,
        httpCode: 0,
        exitCode: resolved.blockedPrivateIp ? 0 : resolved.exitCode || 6,
        remoteIp: resolved.remoteIp || '',
        contentType: '',
        error: resolved.error || 'DNS resolution failed',
        blockedPrivateIp: Boolean(resolved.blockedPrivateIp),
        spawnError: false,
      };
    }

    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    let hopResponse = null;

    for (const pinnedIp of resolved.ips) {
      const resolveTarget = pinnedIp.includes(':') ? `[${pinnedIp}]` : pinnedIp;
      const resolveEntry = `${rawHostname}:${port}:${resolveTarget}`;

      const args = [
        '--resolve',
        resolveEntry,
        '--proto',
        '=http,https',
        '--silent',
        '--output',
        outputFile,
        '--connect-timeout',
        String(connectTimeoutSec),
        '--max-time',
        String(maxTimeSec),
      ];
      if (headOnly) {
        args.push('--head');
      }
      if (maxFilesize > 0) {
        args.push('--max-filesize', String(maxFilesize));
      }
      args.push(
        '-H',
        `User-Agent: ${userAgent || DEFAULT_USER_AGENT}`,
        '-w',
        '%{http_code}\t%{exitcode}\t%{remote_ip}\t%{content_type}\t%{redirect_url}\t%{errormsg}',
        '--',
        currentUrl,
      );

      const execRes = await execCurl(args, (maxTimeSec + 5) * 1000);
      if (execRes.spawnError) {
        return {
          url: currentUrl,
          httpCode: 0,
          exitCode: -1,
          remoteIp: '',
          contentType: '',
          error: execRes.error || 'curl unavailable',
          blockedPrivateIp: false,
          spawnError: true,
        };
      }

      const [
        codeStr = '0',
        exitStr = '',
        remoteIpRaw = '',
        contentType = '',
        redirectUrl = '',
        ...errParts
      ] = execRes.stdout.split('\t');

      const httpCode = /^\d{3}$/.test(codeStr.trim())
        ? Number(codeStr.trim())
        : 0;
      const exitCode = /^\d+$/.test(exitStr.trim())
        ? Number(exitStr.trim())
        : execRes.processExitCode;
      const remoteIp = remoteIpRaw.trim() || pinnedIp;
      const error = errParts.join('\t').trim();

      if (!allowPrivateIp && remoteIp && isPrivateIp(remoteIp)) {
        return {
          url: currentUrl,
          httpCode: 0,
          exitCode: 0,
          remoteIp,
          contentType: '',
          error: 'Resolved to a private or loopback IP address',
          blockedPrivateIp: true,
          spawnError: false,
        };
      }

      hopResponse = {
        url: currentUrl,
        httpCode,
        exitCode,
        remoteIp,
        contentType: contentType.trim(),
        redirectUrl: redirectUrl.trim(),
        error,
        blockedPrivateIp: false,
        spawnError: false,
      };

      if (httpCode >= 100 && httpCode <= 599) {
        break;
      }
    }

    if (
      hopResponse &&
      REDIRECT_STATUS_CODES.has(hopResponse.httpCode) &&
      hopResponse.redirectUrl &&
      hop < maxRedirs
    ) {
      try {
        const nextUrl = new URL(hopResponse.redirectUrl, currentUrl);
        if (nextUrl.protocol === 'http:' || nextUrl.protocol === 'https:') {
          currentUrl = nextUrl.toString();
          continue;
        }
      } catch {
        // Fall through and return the current HTTP response.
      }
    }

    return {
      url: hopResponse.url,
      httpCode: hopResponse.httpCode,
      exitCode: hopResponse.exitCode,
      remoteIp: hopResponse.remoteIp,
      contentType: hopResponse.contentType,
      error: hopResponse.error,
      blockedPrivateIp: false,
      spawnError: false,
    };
  }

  return {
    url: currentUrl,
    httpCode: 0,
    exitCode: 47,
    remoteIp: '',
    contentType: '',
    error: 'Too many redirects',
    blockedPrivateIp: false,
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
        maxRedirs: 0,
      });
      attempts.push(result);

      if (result.spawnError) {
        return {
          status: 'error',
          failureReason: result.error || 'curl unavailable',
          attempts,
        };
      }
      if (
        result.blockedPrivateIp ||
        (result.remoteIp && isPrivateIp(result.remoteIp))
      ) {
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

async function fetchLatestUserAgent({
  timeoutMs = 5000,
  fetchImpl = fetch,
} = {}) {
  try {
    const response = await fetchImpl(
      'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1',
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': DEFAULT_USER_AGENT },
      },
    );
    if (!response.ok) return DEFAULT_USER_AGENT;
    const data = await response.json();
    const version =
      Array.isArray(data) && data[0] && typeof data[0].version === 'string'
        ? data[0].version.trim()
        : '';
    if (!version || !/^[0-9.]+$/.test(version)) {
      return DEFAULT_USER_AGENT;
    }
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  } catch {
    return DEFAULT_USER_AGENT;
  }
}

function checkLiveIssueGuard(checkResult, currentIssue, requiredLabel) {
  if (!checkResult || !checkResult.shouldClose) {
    return {
      ok: false,
      decision: {
        shouldClose: false,
        skipped: (checkResult && checkResult.skipped) || 'not-closable',
        label: '',
        comment: '',
      },
    };
  }

  if (
    !currentIssue ||
    typeof currentIssue !== 'object' ||
    Array.isArray(currentIssue) ||
    Object.hasOwn(currentIssue, 'pull_request')
  ) {
    return {
      ok: false,
      decision: {
        shouldClose: false,
        skipped: 'invalid-issue',
        label: '',
        comment: '',
      },
    };
  }

  if (comparisonValue(currentIssue.state) !== 'open') {
    return {
      ok: false,
      decision: {
        shouldClose: false,
        skipped: 'already-closed',
        label: '',
        comment: '',
      },
    };
  }

  if (
    requiredLabel &&
    !normalizeLabelNames(currentIssue.labels).has(
      comparisonValue(requiredLabel),
    )
  ) {
    return {
      ok: false,
      decision: {
        shouldClose: false,
        skipped: 'label-removed',
        label: '',
        comment: '',
      },
    };
  }

  return { ok: true };
}

async function probeThemeEndpoint(
  probe,
  baseUrl,
  { userAgent, tempDir, probeUrl, allowPrivateIp = false },
) {
  const host = `${probe.subdomain}${baseUrl}`;
  for (const scheme of ['https', 'http']) {
    const targetUrl = `${scheme}://${host}${probe.path}`;
    if (probe.mode === 'head') {
      const res = await probeUrl(targetUrl, {
        userAgent,
        headOnly: true,
        connectTimeoutSec: 8,
        maxTimeSec: 10,
        allowPrivateIp,
      });
      if (
        !res.blockedPrivateIp &&
        res.httpCode === 200 &&
        res.contentType.toLowerCase().includes(probe.expectedCt)
      ) {
        return true;
      }
      continue;
    }

    const outPath = path.join(tempDir, `${scheme}-${probe.fileName}`);
    try {
      const res = await probeUrl(targetUrl, {
        userAgent,
        maxFilesize: 2097152,
        outputFile: outPath,
        connectTimeoutSec: 8,
        maxTimeSec: 10,
        allowPrivateIp,
      });
      if (
        !res.blockedPrivateIp &&
        res.httpCode === 200 &&
        res.exitCode === 0 &&
        fs.existsSync(outPath)
      ) {
        const body = fs.readFileSync(outPath, 'utf8');
        if (body.includes(probe.pattern)) {
          return true;
        }
      }
    } finally {
      fs.rmSync(outPath, { force: true });
    }
  }
  return false;
}

async function detectWebsiteThemes(
  baseUrl,
  {
    userAgent = DEFAULT_USER_AGENT,
    tempDir = os.tmpdir(),
    probeUrl = probeUrlWithCurl,
    allowPrivateIp = false,
  } = {},
) {
  const probeTempDir = fs.mkdtempSync(path.join(tempDir, 'theme-probe-'));
  const matched = [];
  const checks = [];

  try {
    for (const probe of THEME_PROBES) {
      const detected = await probeThemeEndpoint(probe, baseUrl, {
        userAgent,
        tempDir: probeTempDir,
        probeUrl,
        allowPrivateIp,
      });
      checks.push({ name: probe.name, label: probe.label, detected });
      if (detected) {
        matched.push(probe.label);
      }
    }
  } finally {
    fs.rmSync(probeTempDir, { recursive: true, force: true });
  }

  return {
    matched,
    matchCount: matched.length,
    themeLabel: matched.length === 1 ? matched[0] : '',
    checks,
  };
}

module.exports = {
  DEFAULT_USER_AGENT,
  PRIVATE_DOMAIN_SUFFIXES,
  UNREACHABLE_EXIT_CODES,
  TLS_CERT_EXIT_CODES,
  MAX_ADDRESSES_PER_HOP,
  REACHABILITY_SKIP_REASONS,
  THEME_PROBES,
  MANAGED_THEME_LABELS,
  reachabilitySkipReason,
  extractBaseUrl,
  isPrivateIp,
  resolvePublicIp,
  resolvePublicIps,
  runCurlRequest,
  probeUrlWithCurl,
  checkSiteReachability,
  fetchLatestUserAgent,
  checkLiveIssueGuard,
  detectWebsiteThemes,
};
