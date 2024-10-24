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
      'type[]': {
        type: 'Checkbox',
        label: 'Type',
        value: [],
        options: [],
      },
      'status': {
        type: 'Picker',
        label: 'Status',
        value: '',
        options: [],
      },
      'order': {
        type: 'Picker',
        label: 'Order',
        value: '',
        options: [],
      },
    },
  };

  const filtersContainer = $('div.quickfilter').find('ul');
  filtersContainer.each((i, el) => {
    const filterName = Object.keys(filters.filters)[i];
    if (filterName) {
      filters.filters[filterName].label = $(el)
        .prev()
        .contents()
        .first()
        .text()
        .trim();
      $(el)
        .find('li')
        .each((j, li) => {
          filters.filters[filterName].options.push({
            label: $(li).text().trim(),
            value: decodeURI($(li).find('input').attr('value') || ''),
          });
        });
    }
  });

  if (
    filters.filters['genre[]'].options.length == 0 ||
    filters.filters['type[]'].options.length == 0 ||
    filters.filters['status'].options.length == 0 ||
    filters.filters['order'].options.length == 0
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
  const response = await fetch(url + '/series/');
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
    console.error('(' + e + ')');
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
                `Enter the html text from the page at {sourceSite}/series (at the end press ENTER then press CTRL+C)
(to make it faster you can run \`$("div.quickfilter").parent().html()\` in the console to get only the important html part): `,
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
