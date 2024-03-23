import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as path from 'path';

function getFilters(name: string, html: string) {
  const $: cheerio.CheerioAPI = cheerio.load(html);
  const filters: any = {
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
  });
  fs.writeFileSync(
    path.join(__dirname, 'filters', name + '.json'),
    JSON.stringify(filters, null, 2),
  );
}

async function getFiltersFromURL(name: string, url: string) {
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
  }
}

async function askGetFilter() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const EREASE_PREV_LINE = '\x1b[1A\r\x1b[2K';
  await readline.question(
    'Enter the id of the site (same one as in sources.json): ',
    async (name: string) => {
      await readline.question(
        EREASE_PREV_LINE +
          "Do you want to get the filters from a URL or the html text? (if url dosen't work try html) (url/html): ",
        async (method: string) => {
          if (method.toLowerCase() === 'url') {
            await readline.question(
              EREASE_PREV_LINE +
                'Enter the URL (same one as in sources.json): ',
              async (url: string) => {
                try {
                  await getFiltersFromURL(name, url);
                } catch (e: any) {
                  console.error('Error while getting filters from', url);
                  console.log(e.message || e);
                }
                readline.close();
              },
            );
          } else {
            process.stdout.write(
              EREASE_PREV_LINE +
                `Enter the html text from the page at {sourceSite}/series (at the end press ENTER then press CTRL+C)
(to make it faster you can run \`$(\"div.quickfilter\").parent().html()\` in the console to get only the important html part): `,
            );
            let html = '';
            readline.on('SIGINT', () => {
              console.log('Creating filters file');
              getFilters(name, html);
              readline.close();
            });
            readline.on('line', (line: string) => {
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
