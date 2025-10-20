import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as readline from 'readline';
import process from 'process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function extractValueFromHref(href, baseUrl, name, isGenre = false) {
  const fullUrl = new URL(decodeURI(href), baseUrl);
  const params = fullUrl.searchParams;

  if (isGenre && params.get('type') === 'category_novel' && params.has('id')) {
    return params.get('id');
  }

  const value = params.has('type')
    ? params.get('type')
    : fullUrl.pathname.substring(1) || '';

  if (!value) {
    console.warn(
      `Skipping option for ${name}: Could not determine value from href "${href}"`,
    );
  }
  return value;
}

function getFilters(name, html, baseUrl) {
  const $ = cheerio.load(html);
  const filters = {
    filters: {
      'type': {
        type: 'Picker',
        label: 'Novel Listing',
        value: '',
        options: [],
      },
      'genres': {
        type: 'Picker',
        label: 'Genre',
        value: '',
        options: [],
      },
    },
  };

  const baseSelector = 'div.navbar-collapse li.dropdown';

  // --- Type Filters ---
  let defaultValue = null;
  const typeOptions = [];
  $(`${baseSelector}:eq(0) li a`).each((_, el) => {
    const $el = $(el);
    const title = $el.attr('title');
    const label = $el.text().trim();
    const href = $el.attr('href');

    if (!href || !label || title === 'Latest Release') return;

    const value = extractValueFromHref(href, baseUrl, name);

    if (value) {
      typeOptions.push({ label, value });
      if (title === 'Most Popular') {
        defaultValue = value;
      }
    }
  });
  filters.filters.type.options = typeOptions;
  filters.filters.type.value = defaultValue ?? (typeOptions[0]?.value || ''); // Set default: Popular > First > Empty

  // --- Genres Filters ---
  const genreOptions = [];
  $(`${baseSelector}:eq(1) li a`).each((_, el) => {
    const $el = $(el);
    const label = $el.text().trim();
    const href = $el.attr('href');

    if (!href || !label) return;

    const value = extractValueFromHref(href, baseUrl, name, true);

    if (value) {
      genreOptions.push({ label, value });
    }
  });
  filters.filters.genres.options = genreOptions; // Genre has no default

  // --- Validation and Saving ---
  if (
    filters.filters.type.options.length === 0 ||
    filters.filters.genres.options.length === 0
  ) {
    console.warn(
      `🚨Warning for ${name}: Type or Genre options might be incomplete or empty. (${path.join(__dirname, 'filters', name + '.json')})🚨`,
    );
  }
  try {
    const filtersDir = path.join(__dirname, 'filters');
    if (!fs.existsSync(filtersDir))
      fs.mkdirSync(filtersDir, { recursive: true });
    fs.writeFileSync(
      path.join(filtersDir, name + '.json'),
      JSON.stringify(filters, null, 2),
    );
    console.log(`✅Filters created successfully for ${name}✅`);
  } catch (error) {
    console.error(
      `🚨Error writing filters file for ${name}: ${error.message}🚨`,
    );
  }
}

async function getFiltersFromURL(name, url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status}, while fetching ${response.url}`,
    );
  }
  const html = await response.text();
  try {
    getFilters(name, html, url);
  } catch (e) {
    console.error('Error while getting filters from', url, e);
  }
}

const EREASE_PREV_LINE = '\x1b[1A\r\x1b[2K';
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function askGetFilter() {
  try {
    const sources = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf-8'),
    );

    rl.question(
      'Enter the id of the site (same one as in sources.json): ',
      async name => {
        const baseUrl = await getBaseUrl(name, sources);

        rl.question(
          EREASE_PREV_LINE +
            "Do you want to get the filters from a URL or the html text? (if url doesn't work try html) (url/html): ",
          async method => {
            if (method.toLowerCase() === 'url') {
              if (baseUrl) {
                console.log('Getting filters from', baseUrl);
                try {
                  await getFiltersFromURL(name, baseUrl);
                } catch (e) {
                  console.error('Error while getting filters from', baseUrl);
                  console.log(e.message || e);
                }
              } else {
                console.error(
                  'Cannot get filters from URL: Base URL is not available.',
                );
              }
              rl.close();
            } else {
              rl.question(
                EREASE_PREV_LINE + 'Enter the absolute path to the HTML file: ',
                async filePath => {
                  try {
                    const html = fs.readFileSync(filePath, 'utf-8');
                    if (baseUrl) {
                      console.log('Using base URL:', baseUrl);
                    } else {
                      console.error(
                        'Cannot get filters from HTML: Base URL is not available.',
                      );
                    }
                    getFilters(name, html, baseUrl);
                  } catch (e) {
                    console.error(
                      'Error reading HTML file or getting filters:',
                      e.message || e,
                    );
                  } finally {
                    rl.close();
                  }
                },
              );
            }
          },
        );
      },
    );
  } catch (e) {
    console.error('Error reading sources.json:', e.message || e);
    rl.close();
  }
}

askGetFilter();

async function getBaseUrl(name, sources) {
  const source = sources.find(s => s.id === name);
  if (source && source.sourceSite) {
    console.log('Using base URL from sources.json:', source.sourceSite);
    return source.sourceSite;
  } else {
    console.warn(
      `Source with id "${name}" not found or missing sourceSite in sources.json.`,
    );
    return new Promise(resolve => {
      rl.question(
        EREASE_PREV_LINE + 'Enter the base URL for the site: ',
        manualBaseUrl => {
          resolve(manualBaseUrl);
        },
      );
    });
  }
}

export { getFiltersFromURL };
