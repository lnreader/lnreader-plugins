import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelsOnline implements Plugin.PluginBase {
  id = 'NO.net';
  name = 'novelsOnline';
  site = 'https://novelsonline.org';
  icon = 'src/en/novelsonline/icon.png';
  version = '1.0.1';

  async safeFetch(
    url: string,
    init: any | undefined = undefined,
  ): Promise<CheerioAPI> {
    const r = await fetchApi(url, init);
    if (!r.ok)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const body = await r.text();
    const $ = parseHTML(body);

    // Check if the input is random characters
    // the title element should be empty only if the input is random characters
    const hasElementNodes = $('title') !== undefined;
    if (!hasElementNodes)
      throw new Error(
        'Captcha protection detected (Input is random characters). Please try opening the page in WebView.',
      );

    return $;
  }

  async parseNovels(loadedCheerio: CheerioAPI): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.top-novel-block').each((i, el) => {
      const novelName = loadedCheerio(el).find('h2').text();
      const novelCover = loadedCheerio(el)
        .find('.top-novel-cover img')
        .attr('src');
      const novelUrl = loadedCheerio(el).find('h2 a').attr('href');
      if (!novelUrl) return;

      novels.push({
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
      });
    });
    return novels;
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const form = new URLSearchParams();

    for (const key in filters) {
      if (key === 'keyword') {
        form.append('keyword', filters[key].value as string);
      } else if (typeof filters[key].value === 'object') {
        for (const value of filters[key].value as string[])
          form.append(`include[${key}][]`, value);
      } else if (filters[key].value) {
        form.append(`include[${key}][]`, filters[key].value as string);
      }
    }
    if (form.toString()) {
      form.append('search', '1');
      return page == 1 ? this.detailedSearch(form) : [];
    }

    const $ = await this.safeFetch(this.site + '/top-novel/' + page);
    return this.parseNovels($);
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const form = new URLSearchParams();
    form.append('keyword', searchTerm);
    form.append('search', '1');

    return this.detailedSearch(form);
  }

  async detailedSearch(form: URLSearchParams): Promise<Plugin.NovelItem[]> {
    const $ = await this.safeFetch(this.site + '/detailed-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    return this.parseNovels($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.safeFetch(this.site + novelPath);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').text() || 'Untitled',
      cover: $('.novel-cover').find('a > img').attr('src'),
      chapters: [],
    };

    $('.novel-detail-item').each((i, el) => {
      const detailName = $(el).find('h6').text();
      const detail = $(el).find('.novel-detail-body');

      switch (detailName) {
        case 'Description':
          novel.summary = detail.text();
          break;
        case 'Genre':
          novel.genres = detail
            .find('li')
            .map((_, el) => $(el).text())
            .get()
            .join(', ');
          break;
        case 'Author(s)':
          novel.author = detail
            .find('li')
            .map((_, el) => $(el).text())
            .get()
            .join(', ');
          break;
        case 'Artist(s)':
          const artist = detail
            .find('li')
            .map((_, el) => $(el).text())
            .get()
            .join(', ');
          if (artist && artist != 'N/A') novel.artist = artist;
          break;
        case 'Status':
          novel.status = detail.text().trim();
          break;
      }
    });

    novel.chapters = $('ul.chapter-chs > li > a')
      .map((_, el) => {
        const chapterUrl = $(el).attr('href');
        const chapterName = $(el).text();

        return {
          name: chapterName,
          path: chapterUrl?.replace(this.site, ''),
        } as Plugin.ChapterItem;
      })
      .get();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const loadedCheerio = await this.safeFetch(this.site + chapterPath);

    const chapterText = loadedCheerio('#contentall').html() || '';

    return chapterText;
  }

  filters = {
    keyword: {
      value: '',
      label: 'Keyword',
      type: FilterTypes.TextInput,
    },
    novel_type: {
      value: [],
      label: 'Novel Type',
      options: [
        { label: 'Web Novel', value: 'Web Novel' },
        { label: 'Light Novel', value: 'Light Novel' },
        { label: 'Chinese Novel', value: 'Chinese Novel' },
        { label: 'Korean Novel', value: 'Korean Novel' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    language: {
      value: [],
      label: 'Language',
      options: [
        { label: 'Chinese', value: 'Chinese' },
        { label: 'Japanese', value: 'Japanese' },
        { label: 'Korean', value: 'Korean' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    genre: {
      value: [],
      label: 'Genre',
      options: [
        { label: 'Action', value: '4' },
        { label: 'Adventure', value: '1' },
        { label: 'Celebrity', value: '39' },
        { label: 'Comedy', value: '12' },
        { label: 'Drama', value: '6' },
        { label: 'Ecchi', value: '47' },
        { label: 'Fantasy', value: '2' },
        { label: 'Gender Bender', value: '14' },
        { label: 'Harem', value: '45' },
        { label: 'Historical', value: '22' },
        { label: 'Horror', value: '31' },
        { label: 'Josei', value: '21' },
        { label: 'Martial Arts', value: '18' },
        { label: 'Mature', value: '46' },
        { label: 'Mecha', value: '30' },
        { label: 'Mystery', value: '7' },
        { label: 'Psychological', value: '8' },
        { label: 'Romance', value: '9' },
        { label: 'School Life', value: '10' },
        { label: 'Sci-fi', value: '3' },
        { label: 'Seinen', value: '23' },
        { label: 'Shotacon', value: '35' },
        { label: 'Shoujo', value: '11' },
        { label: 'Shoujo Ai', value: '34' },
        { label: 'Shounen', value: '5' },
        { label: 'Shounen Ai', value: '32' },
        { label: 'Slice of Life', value: '13' },
        { label: 'Sports', value: '33' },
        { label: 'Supernatural', value: '25' },
        { label: 'Tragedy', value: '24' },
        { label: 'Wuxia', value: '17' },
        { label: 'Xianxia', value: '20' },
        { label: 'Xuanhuan', value: '38' },
        { label: 'Yaoi', value: '16' },
        { label: 'Yuri', value: '27' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    completed: {
      value: '',
      label: 'Completed',
      options: [
        { label: 'Any', value: '' },
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelsOnline();
