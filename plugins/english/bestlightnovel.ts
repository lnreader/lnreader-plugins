import { CheerioAPI, load as parseHTML } from 'cheerio';
import { Plugin } from '@typings/plugin';
import { defaultCover } from '@libs/defaultCover';
import { fetchFile } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';

class BLN implements Plugin.PluginBase {
  id = 'BLN';
  name = 'BestLightNovel';
  icon = 'src/en/bestlightnovel/icon.png';
  site = 'https://bestlightnovel.com/';
  version = '1.0.0';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.update_item.list_category').each((i, el) => {
      const novelUrl = loadedCheerio(el).find('h3 > a').attr('href');
      if (!novelUrl) {
        // TODO: Handle error
        console.error('No novel url!');
        return;
      }

      const novelName = loadedCheerio(el).find('h3 > a').text();
      const novelCover = loadedCheerio(el).find('img').attr('src');

      const novel = {
        name: novelName,
        path: novelUrl.replace(this.site, ''),
        cover: novelCover,
      };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + 'novel_list?';
    link += 'type=' + filters.type.value;
    link += '&category=' + filters.category.value;
    link += '&state=' + filters.status.value;
    link += '&page=' + page;

    const result = await fetch(link);
    if (!result.ok) {
      console.error(await result.text());
      // TODO: Cloudflare protection or other error
      return [];
    }
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetch(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.truyen_info_right  h1').text().trim() || '',
      cover: loadedCheerio('.info_image img').attr('src') || defaultCover,
      summary: loadedCheerio('#noidungm').text()?.trim() || '',
      chapters: [],
    };
    loadedCheerio('ul.truyen_info_right > li').each(function () {
      const detailName = loadedCheerio(this).find('span').text();
      const detail = loadedCheerio(this)
        .find('a')
        .map((a, ex) => loadedCheerio(ex).text())
        .toArray()
        .join(', ');

      switch (detailName) {
        case 'Author(s): ':
          novel.author = detail;
          break;
        case 'GENRES: ':
          novel.genres = detail;
          break;
        case 'STATUS : ':
          novel.status =
            detail === 'Ongoing'
              ? NovelStatus.Ongoing
              : detail === 'Completed'
                ? NovelStatus.Completed
                : NovelStatus.Unknown;
      }
    });

    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('.chapter-list div.row').each((i, el) => {
      const chapterName = loadedCheerio(el).find('a').text().trim();
      const releaseDate = loadedCheerio(el).find('span:last').text().trim();

      const months = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ].join('|');
      const rx = new RegExp(`(${months})-(\\d{1,2})-(\\d{2})`, 'i').exec(
        releaseDate,
      );
      if (!rx) return;
      const year = 2000 + +rx[3];
      const month = months.indexOf(rx[1].toLowerCase());
      const day = +rx[2];

      const chapterUrl = loadedCheerio(el).find('a').attr('href');
      if (!chapterUrl) {
        // TODO: Handle error
        console.error('No chapter url!');
        return;
      }

      chapter.push({
        name: chapterName,
        releaseTime: new Date(year, month, day).toISOString(),
        path: chapterUrl.replace(this.site, ''),
      });
    });

    novel.chapters = chapter.reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetch(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('#vung_doc').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search_novels/${searchTerm}?page=${page}`;

    const result = await fetch(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }

  filters = {
    status: {
      label: 'Status',
      value: 'all',
      options: [
        { label: 'ALL', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Ongoing', value: 'ongoing' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      value: 'topview',
      label: 'Type',
      options: [
        { label: 'Recently updated', value: 'latest' },
        { label: 'Newest', value: 'newest' },
        { label: 'Top view', value: 'topview' },
      ],
      type: FilterTypes.Picker,
    },
    category: {
      label: 'Category',
      value: 'all',
      options: [
        { label: 'ALL', value: 'all' },
        { label: 'Action', value: '1' },
        { label: 'Adventure', value: '2' },
        { label: 'Animals', value: '65' },
        { label: 'Arts', value: '40' },
        { label: 'Biographies', value: '41' },
        { label: 'Business', value: '42' },
        { label: 'Chinese', value: '3' },
        { label: 'Comedy', value: '4' },
        { label: 'Computers', value: '43' },
        { label: 'Crafts, Hobbies', value: '45' },
        { label: 'Drama', value: '5' },
        { label: 'Education', value: '46' },
        { label: 'English', value: '6' },
        { label: 'Entertainment', value: '47' },
        { label: 'Fantasy', value: '7' },
        { label: 'Fiction', value: '48' },
        { label: 'Gender Bender', value: '8' },
        { label: 'Harem', value: '9' },
        { label: 'Historical', value: '10' },
        { label: 'History', value: '49' },
        { label: 'Home', value: '50' },
        { label: 'Horror', value: '11' },
        { label: 'Humor', value: '51' },
        { label: 'Investing', value: '52' },
        { label: 'Josei', value: '12' },
        { label: 'Korean', value: '13' },
        { label: 'Literature', value: '53' },
        { label: 'Lolicon', value: '14' },
        { label: 'Martial Arts', value: '15' },
        { label: 'Mature', value: '16' },
        { label: 'Mecha', value: '17' },
        { label: 'Memoirs', value: '54' },
        { label: 'Mystery', value: '18' },
        { label: 'Original', value: '19' },
        { label: 'Other Books', value: '66' },
        { label: 'Philosophy', value: '55' },
        { label: 'Photography', value: '56' },
        { label: 'Politics', value: '57' },
        { label: 'Professional', value: '58' },
        { label: 'Psychological', value: '20' },
        { label: 'Reference', value: '59' },
        { label: 'Reincarnation', value: '21' },
        { label: 'Religion', value: '60' },
        { label: 'Romance', value: '22' },
        { label: 'School Life', value: '23' },
        { label: 'School Stories', value: '67' },
        { label: 'Sci-Fi', value: '24' },
        { label: 'Seinen', value: '25' },
        { label: 'Short Stories', value: '68' },
        { label: 'Shotacon', value: '26' },
        { label: 'Shoujo', value: '27' },
        { label: 'Shoujo Ai', value: '28' },
        { label: 'Shounen', value: '29' },
        { label: 'Shounen Ai', value: '30' },
        { label: 'Slice Of Life', value: '31' },
        { label: 'Smut', value: '32' },
        { label: 'Social Science', value: '61' },
        { label: 'Spirituality', value: '62' },
        { label: 'Sports', value: '33' },
        { label: 'Supernatural', value: '34' },
        { label: 'Teaser', value: '69' },
        { label: 'Technical', value: '63' },
        { label: 'Technology', value: '64' },
        { label: 'Tragedy', value: '35' },
        { label: 'Virtual Reality', value: '36' },
        { label: 'Wuxia', value: '37' },
        { label: 'Xianxia', value: '38' },
        { label: 'Xuanhuan', value: '39' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new BLN();
