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

  const divs = $('form.search-advanced-form > div');

  // ==================== Genre ====================
  const genreDiv = divs.eq(0);
  genreDiv.find('label').each((i, el) => {
    const option = {
      label: $(el).text().trim(),
      value: decodeURI($(el).attr('for') || ''),
    };
    filters.filters['genre[]'].options.push(option);
  });

  // ===================== Op ======================
  const statusDiv = divs.eq(1);
  filters.filters['op'].label = statusDiv
    .find('option')
    .eq(1)
    .text()
    .replace('AND', '')
    .replace('(', '')
    .replace(')', '')
    .trim();

  // ==================== Author ====================
  const authorDiv = divs.eq(2);
  filters.filters['author'].label = authorDiv.find('span').text().trim();

  // ==================== Artist ====================
  const artistDiv = divs.eq(3);
  filters.filters['artist'].label = artistDiv.find('span').text().trim();

  // ==================== Release ====================
  const releaseDiv = divs.eq(4);
  filters.filters['release'].label = releaseDiv.find('span').text().trim();

  // ==================== Adult ====================
  const adultDiv = divs.eq(5);
  filters.filters['adult'].label = adultDiv.find('span').text().trim();
  adultDiv.find('option').each((i, el) => {
    const option = {
      label: $(el).text().trim(),
      value: decodeURI($(el).attr('value') || ''),
    };
    filters.filters['adult'].options.push(option);
  });

  // ==================== Status ====================
  const statusDiv2 = divs.eq(6);
  filters.filters['status[]'].label = statusDiv2.find('span').text().trim();
  statusDiv2.find('label').each((i, el) => {
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

async function getFiltersFromURL(name: string, url: string) {
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
                `Enter the html text from the page at {sourceSite}/?s=&post_type=wp-manga (at the end press ENTER then press CTRL+C): `,
            );
            let html = '';
            readline.on('SIGINT', () => {
              console.log('Stopeed reading input, creating filters file');
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
