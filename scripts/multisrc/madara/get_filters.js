import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as readline from 'readline';
import process from 'process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getFilters(name, html) {
  const $ = cheerio.load(html);
  const filters = {
    filters: {
      'genre[]': {
        type: 'Checkbox',
        label: 'Genre',
        value: [],
        options: [],
      },
      'op': {
        type: 'Switch',
        label: 'Having ALL selected genres',
        value: false,
      },
      'author': {
        type: 'Text',
        label: 'Author',
        value: '',
      },
      'artist': {
        type: 'Text',
        label: 'Artist',
        value: '',
      },
      'release': {
        type: 'Text',
        label: 'Year of Released',
        value: '',
      },
      'adult': {
        type: 'Picker',
        label: 'Adult content',
        value: '',
        options: [],
      },
      'status[]': {
        type: 'Checkbox',
        label: 'Status',
        value: [],
        options: [],
      },
      'm_orderby': {
        type: 'Picker',
        label: 'Order by',
        value: '',
        options: [],
      },
    },
  };

  const form = $('form.search-advanced-form');

  // ==================== Genre ====================
  form.find('input[name="genre[]"]').each((i, el) => {
    const option = {
      label: $(el).next('label').text().trim(),
      value: decodeURI($(el).attr('value') || ''),
    };
    filters.filters['genre[]'].options.push(option);
  });

  // ===================== Op ======================
  filters.filters['op'].label =
    form
      .find('select[name="op"] > option')
      .eq(1)
      .text()
      .replace('AND', '')
      .replace('(', '')
      .replace(')', '')
      .trim() || 'Having ALL selected genres';

  // ==================== Author ====================
  filters.filters['author'].label =
    form.find('input[name="author"]').prev('span').text().trim() || 'Author';

  // ==================== Artist ====================
  filters.filters['artist'].label =
    form.find('input[name="artist"]').prev('span').text().trim() || 'Artist';

  // ==================== Release ====================
  filters.filters['release'].label =
    form.find('input[name="release"]').prev('span').text().trim() ||
    'Year of Released';

  // ==================== Adult ====================
  filters.filters['adult'].label =
    form.find('select[name="adult"]').prev('span').text().trim() ||
    'Adult content';
  form.find('select[name="adult"] > option').each((i, el) => {
    const option = {
      label: $(el).text().trim(),
      value: decodeURI($(el).attr('value') || ''),
    };
    filters.filters['adult'].options.push(option);
  });
  if (filters.filters['adult'].options.length == 0) {
    filters.filters['adult'].options = [
      { label: 'All', value: '' },
      { label: 'None adult content', value: '0' },
      { label: 'Only adult content', value: '1' },
    ];
  }

  // ==================== Status ====================
  filters.filters['status[]'].label =
    form.find('input[name="status[]"]').parent().prev('span').text().trim() ||
    'Status';
  form
    .find('input[name="status[]"]')
    .next('label')
    .each((i, el) => {
      const option = {
        label: $(el).text().trim(),
        value: $(el).attr('for'),
      };
      filters.filters['status[]'].options.push(option);
    });

  // ==================== Order by ====================
  const orderByDiv = $('div.c-nav-tabs').eq(0);
  filters.filters['m_orderby'].label = orderByDiv.find('span').text().trim();
  orderByDiv.find('a').each((i, el) => {
    const option = {
      label: $(el).text().trim(),
      value: decodeURI(
        ($(el).attr('href')?.split('=').length == 3
          ? $(el).attr('href')?.split('=')[2]
          : '') || '',
      ),
    };
    filters.filters['m_orderby'].options.push(option);
  });

  if (
    filters.filters['m_orderby'].options.length == 0 ||
    filters.filters['status[]'].options.length == 0 ||
    filters.filters['adult'].options.length == 0 ||
    filters.filters['genre[]'].options.length == 0
  ) {
    console.error(
      `🚨Error in filters for ${name} please fix manually (${path.join(__dirname, 'filters', name + '.json')})🚨`,
    );
  }

  fs.writeFileSync(
    path.join(__dirname, 'filters', name + '.json'),
    JSON.stringify(filters, null, 2),
  );
  console.log(`✅Filters created successfully for ${name}✅`);
}

async function getFiltersFromURL(name, url) {
  const response = await fetch(url + '/?s=&post_type=wp-manga');
  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status}, while fetching ${response.url}`,
    );
  }
  const html = await response.text();
  try {
    getFilters(name, html);
  } catch (e) {
    console.error('Error while getting filters from', url);
  }
}

async function askGetFilter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const EREASE_PREV_LINE = '\x1b[1A\r\x1b[2K';
  await rl.question(
    'Enter the id of the site (same one as in sources.json): ',
    async name => {
      await rl.question(
        EREASE_PREV_LINE +
          "Do you want to get the filters from a URL or the html text? (if url dosen't work try html) (url/html): ",
        async method => {
          if (method.toLowerCase() === 'url') {
            const sources = JSON.parse(
              fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf-8'),
            );
            const source = sources.find(s => s.id === name);
            if (source && source.sourceSite) {
              console.log('Getting filters from', source.sourceSite);
              try {
                await getFiltersFromURL(name, source.sourceSite);
              } catch (e) {
                console.error(
                  'Error while getting filters from',
                  source.sourceSite,
                );
                console.log(e.message || e);
              }
              rl.close();
            } else {
              await rl.question(
                EREASE_PREV_LINE +
                  'Enter the URL (same one as in sources.json): ',
                async url => {
                  rl.close();
                  try {
                    await getFiltersFromURL(name, url);
                  } catch (e) {
                    console.error('Error while getting filters from', url);
                    console.log(e.message || e);
                  }
                },
              );
            }
          } else {
            process.stdout.write(
              EREASE_PREV_LINE +
                `Enter the html text from the page at {sourceSite}/?s=&post_type=wp-manga (at the end press ENTER then press CTRL+C): `,
            );
            let html = '';
            rl.on('SIGINT', () => {
              console.log('Stopeed reading input, creating filters file');
              getFilters(name, html);
              rl.close();
            });
            rl.on('line', line => {
              html += line + '\n';
            });
          }
        },
      );
    },
  );
}

askGetFilter();

export { getFiltersFromURL };
