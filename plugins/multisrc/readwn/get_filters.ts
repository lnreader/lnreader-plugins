require('module-alias/register');
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as path from 'path';
import { FilterTypes, FilterOption } from '@libs/filterInputs';
const type: string[] = ['genres', 'status', 'sort'];

async function getFilters(name: string, url: string) {
  const html = await fetch(url + '/list/all/all-newstime-0.html').then(res =>
    res.text(),
  );
  const $: cheerio.CheerioAPI = cheerio.load(html);
  const filters: any = {
    'sort': {
      type: FilterTypes.Picker,
      label: 'Sort By',
      value: 'onclick',
      options: [],
    },
    'status': {
      type: FilterTypes.Picker,
      label: 'Status',
      value: 'all',
      options: [],
    },
    'genres': {
      type: FilterTypes.Picker,
      label: 'Genre / Category',
      value: '',
      options: [],
    },
    'tags': {
      type: FilterTypes.Picker,
      label: 'Tags',
      value: '',
      options: [{ label: 'NONE', value: '' }],
    },
  };

  $('ul.proplist')?.each?.(function (index, ulElement) {
    if (!type[index]) return;
    $(ulElement)
      .find('li > a')
      .each((indx, liElement) =>
        filters[type[index]].options.push({
          label: $(liElement).text(),
          value: $(liElement).attr('href'),
        }),
      );
    filters[type[index]].options = filters[type[index]].options.map(
      (item: FilterOption) => {
        let res = item.value;
        if (index == 0) res = item.value.split('/')[2];
        if (index == 1)
          res = item.value.replace(/\/list\/all\/(.*?)-.*$/, '$1');
        if (index == 2) res = item.value.replace(/.*\/all-(.*?)-.*/, '$1');
        return {
          label: item.label,
          value: res,
        };
      },
    ) as FilterOption[];
    filters[type[index]].options.sort((a: FilterOption, b: FilterOption) => {
      if (a.label === 'All') {
        return -1;
      } else if (b.label === 'All') {
        return 1;
      }
      return a.label.localeCompare(b.label);
    });
  });

  const response = await fetch(url + '/browsetags/').then(res => res.text());
  const loadedCheerio: cheerio.CheerioAPI = cheerio.load(response);
  const allPage = loadedCheerio('.tag-letters > a')
    .map((index, element) => loadedCheerio(element).attr('href'))
    .get();
  // ===================== tags ======================
  for (let i = 0; i < allPage.length; i++) {
    console.log('fetch', url + allPage[i]);
    const resTags = await fetch(url + allPage[i]).then(res => res.text());
    const $: cheerio.CheerioAPI = cheerio.load(resTags);
    $('.tag-items > li > a').each((index, element) =>
      filters['tags'].options.push({
        label: $(element).text()?.trim(),
        value: $(element)
          .attr('href')
          ?.split('/')
          ?.pop()
          ?.replace('-0.html', ''),
      }),
    );
    const nextPage = $('.pagination > li:last-child > a').attr('href');
    if (nextPage) {
      const allpage = parseInt(nextPage.replace(/[^0-9]/g, '') || '0', 10);
      for (let pageNo = 0; pageNo < allpage; pageNo++) {
        await sleep(3000);
        console.log(
          'fetch',
          url + allPage[i].replace('-0.html', `-${pageNo + 1}.html`),
        );
        const resTags = await fetch(
          url + allPage[i].replace('-0.html', `-${pageNo + 1}.html`),
        ).then(res => res.text());
        const $: cheerio.CheerioAPI = cheerio.load(resTags);

        $('.tag-items > li > a').each((index, element) =>
          filters['tags'].options.push({
            label: $(element).text()?.trim(),
            value: $(element).attr('href')?.split('/')?.pop()?.split('-')?.[0],
          }),
        );
      }
    }
    await sleep(3000);
  }

  fs.writeFileSync(
    path.join(__dirname, 'filters', name + '.json'),
    JSON.stringify({ filters }, null, 2),
  );
  console.log(`✅Filters created successfully for ${name}✅`);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        EREASE_PREV_LINE + 'Enter the URL (same one as in sources.json): ',
        async (url: string) => {
          try {
            await getFilters(name, url);
          } catch (e: any) {
            console.error('Error while getting filters from', url);
            console.log(e.message || e);
          }
          readline.close();
        },
      );
    },
  );
}

askGetFilter();
