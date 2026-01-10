#!/usr/bin/env node

import https from 'https';
import http from 'http';
import { URL, fileURLToPath } from 'url';
import fs from 'fs';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TIMEOUT = 10000;
const CONCURRENT_REQUESTS = 10;
const PLUGINS_JSON_URL =
  'https://raw.githubusercontent.com/LNReader/lnreader-plugins/refs/heads/plugins/v3.0.0/.dist/plugins.json';

const results = {
  accessible: [],
  inaccessible: [],
  cloudflare: [],
  errors: [],
};

let totalSites = 0;
let checkedSites = 0;
let activeRequests = 0;

function checkSite(url, pluginInfo) {
  return new Promise(resolve => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'HEAD',
      timeout: TIMEOUT,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    const req = client.request(options, res => {
      const headers = res.headers || {};
      const isCloudflare =
        headers['cf-ray'] ||
        headers['server']?.toLowerCase().includes('cloudflare') ||
        headers['cf-cache-status'] ||
        headers['cf-request-id'] ||
        (res.statusCode === 403 &&
          (headers['server']?.toLowerCase().includes('cloudflare') ||
            headers['cf-ray']));

      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({
          status: 'accessible',
          statusCode: res.statusCode,
          url,
          pluginInfo,
        });
      } else if (res.statusCode === 403 && isCloudflare) {
        resolve({
          status: 'cloudflare',
          statusCode: res.statusCode,
          url,
          pluginInfo,
          reason: 'HTTP 403 (Cloudflare protected)',
        });
      } else {
        resolve({
          status: 'inaccessible',
          statusCode: res.statusCode,
          url,
          pluginInfo,
          reason: `HTTP ${res.statusCode}`,
        });
      }
      res.destroy();
    });

    req.on('error', error => {
      resolve({
        status: 'inaccessible',
        url,
        pluginInfo,
        reason: error.message || 'Connection error',
        error: error.code || 'UNKNOWN',
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'inaccessible',
        url,
        pluginInfo,
        reason: 'Request timeout',
        error: 'TIMEOUT',
      });
    });

    req.setTimeout(TIMEOUT);
    req.end();
  });
}

async function processSites(sites) {
  const queue = [...sites];

  async function processNext() {
    if (queue.length === 0) {
      return;
    }

    activeRequests++;
    const { url, pluginInfo } = queue.shift();

    try {
      const result = await checkSite(url, pluginInfo);
      checkedSites++;

      if (result.status === 'accessible') {
        results.accessible.push(result);
        process.stdout.write(
          `\r✓ ${checkedSites}/${totalSites} - ${pluginInfo.name || url}`,
        );
      } else if (result.status === 'cloudflare') {
        results.cloudflare.push(result);
        process.stdout.write(
          `\r⚠ ${checkedSites}/${totalSites} - ${pluginInfo.name || url} (Cloudflare)`,
        );
      } else {
        results.inaccessible.push(result);
        process.stdout.write(
          `\r✗ ${checkedSites}/${totalSites} - ${pluginInfo.name || url} (${result.reason})`,
        );
      }
    } catch (error) {
      checkedSites++;
      results.errors.push({
        url,
        pluginInfo,
        error: error.message,
      });
      process.stdout.write(
        `\r✗ ${checkedSites}/${totalSites} - ${pluginInfo.name || url} (Error)`,
      );
    } finally {
      activeRequests--;
      await processNext();
    }
  }

  const promises = [];
  for (let i = 0; i < CONCURRENT_REQUESTS && i < sites.length; i++) {
    promises.push(processNext());
  }

  await Promise.all(promises);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    const req = client.request(options, res => {
      if (res.statusCode !== 200) {
        reject(
          new Error(`Failed to fetch plugins.json: HTTP ${res.statusCode}`),
        );
        return;
      }

      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    });

    req.on('error', error => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function main() {
  console.log('Fetching plugins.json from GitHub...\n');

  try {
    const plugins = await fetchJson(PLUGINS_JSON_URL);
    console.log(`Successfully fetched ${plugins.length} plugins.\n`);

    const siteMap = new Map();
    plugins.forEach(plugin => {
      const site = plugin.site;
      if (site && site !== 'url' && site.trim() !== '') {
        if (!siteMap.has(site)) {
          siteMap.set(site, {
            url: site,
            pluginInfo: {
              id: plugin.id,
              name: plugin.name,
              lang: plugin.lang,
            },
          });
        }
      }
    });

    const sites = Array.from(siteMap.values());
    totalSites = sites.length;

    console.log(`Found ${totalSites} unique sites to check.\n`);
    console.log('Checking sites...\n');

    await processSites(sites);

    console.log('\n\n' + '='.repeat(80));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total sites checked: ${totalSites}`);
    console.log(`Accessible: ${results.accessible.length}`);
    console.log(`Cloudflare protected: ${results.cloudflare.length}`);
    console.log(`Inaccessible/Broken: ${results.inaccessible.length}`);
    console.log(`Errors: ${results.errors.length}`);

    if (results.cloudflare.length > 0) {
      console.warn('\n' + '='.repeat(80));
      console.warn('CLOUDFLARE PROTECTED SITES (excluded from broken list):');
      console.warn('='.repeat(80));
      results.cloudflare.forEach((item, index) => {
        console.warn(
          `\n${index + 1}. ${item.pluginInfo.name || 'Unknown'} (${item.pluginInfo.id})`,
        );
        console.warn(`   URL: ${item.url}`);
        console.warn(`   Language: ${item.pluginInfo.lang || 'N/A'}`);
      });
    }

    if (results.inaccessible.length > 0 || results.errors.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('INACCESSIBLE OR BROKEN SITES:');
      console.log('='.repeat(80));

      const allFailed = [...results.inaccessible, ...results.errors];
      allFailed.forEach((item, index) => {
        console.log(
          `\n${index + 1}. ${item.pluginInfo.name || 'Unknown'} (${item.pluginInfo.id})`,
        );
        console.log(`   URL: ${item.url}`);
        console.log(`   Language: ${item.pluginInfo.lang || 'N/A'}`);
        if (item.statusCode) {
          console.log(`   Status Code: ${item.statusCode}`);
        }
        if (item.reason) {
          console.log(`   Reason: ${item.reason}`);
        }
        if (item.error) {
          console.log(`   Error: ${item.error}`);
        }
      });

      const reportFile = path.join(__dirname, '..', 'broken-sites-report.json');
      fs.writeFileSync(
        reportFile,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            total: totalSites,
            accessible: results.accessible.length,
            cloudflare: results.cloudflare.length,
            inaccessible: results.inaccessible.length,
            errors: results.errors.length,
            brokenSites: allFailed.map(item => ({
              id: item.pluginInfo.id,
              name: item.pluginInfo.name,
              url: item.url,
              lang: item.pluginInfo.lang,
              statusCode: item.statusCode,
              reason: item.reason,
              error: item.error,
            })),
            cloudflareSites: results.cloudflare.map(item => ({
              id: item.pluginInfo.id,
              name: item.pluginInfo.name,
              url: item.url,
              lang: item.pluginInfo.lang,
              statusCode: item.statusCode,
              reason: item.reason,
            })),
          },
          null,
          2,
        ),
      );

      console.log(`\n\nDetailed report saved to: ${reportFile}`);
    } else {
      console.log('\n✓ All sites are accessible!');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
