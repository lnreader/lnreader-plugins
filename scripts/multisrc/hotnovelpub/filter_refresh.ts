import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as path from 'path';
import list from './sources.json';
import { HotNovelPubMetadata } from './template';

async function getFilters(sources: HotNovelPubMetadata) {
  const filters: any = {
    sort: {
      type: 'Picker',
      label: 'Order',
      value: 'hot',
      options: [],
    },
    category: {
      type: 'Picker',
      label: 'category',
      value: '',
      options: [{ label: 'NONE', value: '' }],
    },
  };
  const body = await fetch(sources.sourceSite).then(res => res.text());
  const $: cheerio.CheerioAPI = cheerio.load(body);
  $('.new-update').remove();

  $('section > div').each((i, el) => {
    const id = $(el).find('a[class="see-all"]').attr('href');
    if (id) {
      filters.sort.options.push({
        label: $(el).find('[class="section-title"]').text().trim(),
        value: id.split('/').pop(),
      });
    }
  });

  filters.category.label = $('.category-title').text().trim();
  const apiSite = sources.sourceSite.replace('://', '://api.');
  const jsonRaw = await fetch(apiSite + '/categories', {
    headers: {
      lang: sources.options?.lang || 'en',
    },
  });
  const json = (await jsonRaw.json()) as response;

  if (json.data?.length) {
    json.data
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(category =>
        filters.category.options.push({
          label: category.name,
          value: category.slug,
        }),
      );
  }
  return filters;
}

interface response {
  status: number;
  message: string;
  data?: DataEntity[];
}
interface DataEntity {
  id: number;
  name: string;
  slug: string;
}

async function start() {
  const result = [];
  for (const sources of list) {
    console.log('updating the filters in', sources.sourceName);
    const NewFilters = await getFilters(sources as any);
    sources.filters = NewFilters;
    result.push(sources);
  }
  fs.writeFileSync(
    path.join(__dirname, 'sources.json'),
    JSON.stringify(result, null, 2),
  );
}

start();
