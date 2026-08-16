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
      language: {
        label: 'Language',
        value: [],
        options: [],
        type: 'Checkbox',
      },
      genre_operator: {
        label: 'Genres (And/Or/Exclude)',
        value: 'and',
        options: [],
        type: 'Picker',
      },
      genres: {
        label: 'Genres',
        value: [],
        options: [],
        type: 'Checkbox',
      },
      chapters: {
        label: 'Chapters',
        value: '0',
        options: [],
        type: 'Picker',
      },
      rating_operator: {
        label: 'Rating (Min/Max)',
        value: 'min',
        options: [],
        type: 'Picker',
      },
      rating: {
        label: 'Rating',
        value: '0',
        options: [],
        type: 'Picker',
      },
      status: {
        label: 'Translation Status',
        value: '-1',
        options: [],
        type: 'Picker',
      },
      sort: {
        label: 'Sort Results By',
        value: 'rank-top',
        options: [],
        type: 'Picker',
      },
      tagcon: {
        label: 'Tags (And/Or)',
        value: 'and',
        options: [],
        type: 'Picker',
      },
      author: {
        label: 'Author',
        value: '',
        type: 'Text',
      },
    },
  };

  // ==================== Language ====================
  filters.filters.language.label =
    $('.search-adv-form > label').text().trim() || 'Language';
  $('input[name="country_id[]"]').each((i, el) => {
    filters.filters.language.options.push({
      label: $(el).parent().text().trim() || $(el).next('label').text().trim(),
      value: $(el).attr('value'),
    });
  });

  // ==================== Genre operator ====================
  $('select[name="ctgcon"] option').each((i, el) => {
    filters.filters.genre_operator.options.push({
      label: $(el).text().trim(),
      value: $(el).attr('value'),
    });
  });
  const genreOpSelected =
    $('select[name="ctgcon"] option:selected').attr('value') || 'and';
  filters.filters.genre_operator.value = genreOpSelected;

  // ==================== Genres ====================
  $('input[name="categories[]"]').each((i, el) => {
    filters.filters.genres.options.push({
      label: $(el).parent().text().trim() || $(el).next('label').text().trim(),
      value: $(el).attr('value'),
    });
  });

  // ==================== Chapters ====================
  $('select[name="totalchapter"] option').each((i, el) => {
    filters.filters.chapters.options.push({
      label: $(el).text().trim(),
      value: $(el).attr('value'),
    });
  });
  const chaptersSelected =
    $('select[name="totalchapter"] option:selected').attr('value') || '0';
  filters.filters.chapters.value = chaptersSelected;

  // ==================== Rating operator ====================
  $('select[name="ratcon"] option').each((i, el) => {
    filters.filters.rating_operator.options.push({
      label: $(el).text().trim(),
      value: $(el).attr('value'),
    });
  });
  const ratconSelected =
    $('select[name="ratcon"] option:selected').attr('value') || 'min';
  filters.filters.rating_operator.value = ratconSelected;

  // ==================== Rating ====================
  $('select[name="rating"] option').each((i, el) => {
    filters.filters.rating.options.push({
      label: $(el).text().trim(),
      value: $(el).attr('value'),
    });
  });
  const ratingSelected =
    $('select[name="rating"] option:selected').attr('value') || '0';
  filters.filters.rating.value = ratingSelected;

  // ==================== Status ====================
  $('select[name="status"] option').each((i, el) => {
    filters.filters.status.options.push({
      label: $(el).text().trim(),
      value: $(el).attr('value'),
    });
  });
  const statusSelected =
    $('select[name="status"] option:selected').attr('value') || '-1';
  filters.filters.status.value = statusSelected;

  // ==================== Sort ====================
  $('select[name="sort"] option').each((i, el) => {
    filters.filters.sort.options.push({
      label: $(el).text().trim(),
      value: $(el).attr('value'),
    });
  });
  const sortSelected =
    $('select[name="sort"] option:selected').attr('value') || 'rank-top';
  filters.filters.sort.value = sortSelected;

  // ==================== Tag operator ====================
  $('select[name="tagcon"] option').each((i, el) => {
    filters.filters.tagcon.options.push({
      label: $(el).text().trim(),
      value: $(el).attr('value'),
    });
  });
  const tagconSelected =
    $('select[name="tagcon"] option:selected').attr('value') || 'and';
  filters.filters.tagcon.value = tagconSelected;

  // ==================== Author ====================
  filters.filters.author.label =
    $('input[name="author"]').prev('label').text().trim() ||
    $('input[name="author"]').parent().prev().text().trim() ||
    'Author';

  // ==================== checks ====================
  if (
    filters.filters.genres.options.length == 0 ||
    filters.filters.language.options.length == 0 ||
    filters.filters.sort.options.length == 0
  ) {
    console.error(
      `🚨Error in filters for ${name} please fix manually (${path.join(__dirname, 'filters', name + '.json')})🚨`,
    );
  }

  // add `// prettier-ignore` above each `options` array so prettier does not
  // reformat them (the generator strips these comments before parsing)
  const json = JSON.stringify(filters, null, 2).replace(
    /\n(\s*)"options": \[/g,
    '\n$1// prettier-ignore\n$1"options": [',
  );

  fs.writeFileSync(
    path.join(__dirname, 'filters', name + '.json'),
    json + '\n',
  );
  console.log(`✅Filters created successfully for ${name}✅`);
}

async function getFiltersFromURL(name, url) {
  const response = await fetch(url + '/search-adv');
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
                `Enter the html text from the page at {sourceSite}/search-adv (at the end press ENTER then press CTRL+C)
(to make it faster you can run \`$(".search-adv-form").parent().html()\` in the console to get only the important html part): `,
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
