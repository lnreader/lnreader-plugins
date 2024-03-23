import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelFull implements Plugin.PluginBase {
  id = 'novelfull';
  name = 'NovelFull';
  version = '1.0.0';
  icon = 'src/en/novelfull/icon.png';
  site = 'https://novelfull.com/';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.col-truyen-main .list-truyen .row').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('h3.truyen-title > a').text();

      const novelCover =
        this.site + loadedCheerio(ele).find('img').attr('src')?.slice(1);

      const novelUrl = loadedCheerio(ele)
        .find('h3.truyen-title > a')
        .attr('href')
        ?.slice(1);

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl,
      };

      novels.push(novel);
    });

    return novels;
  }

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site;
    if (filters.genre.value !== '') link += `genre/${filters.genre.value}`;
    else link += filters.sort.value;

    link += `?page=${page}`;

    const body = await fetchApi(link).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('div.book > img').attr('alt') || 'Untitled',
      cover: this.site + loadedCheerio('div.book > img').attr('src'),
      summary: loadedCheerio('div.desc-text').text().trim(),
      status: loadedCheerio('h3:contains("Status")').next().text(),
      chapters: [],
    };

    novel.author = loadedCheerio('h3:contains("Author")')
      .parent()
      .contents()
      .text()
      .replace('Author:', '');

    novel.genres = loadedCheerio('h3:contains("Genre")')
      .siblings()
      .map((i, el) => loadedCheerio(el).text())
      .toArray()
      .join(',');

    const novelId = loadedCheerio('#rating').attr('data-novel-id')!;
    const chapter: Plugin.ChapterItem[] = [];

    const getChapters = async (id: string) => {
      const chapterListUrl = this.site + 'ajax/chapter-option?novelId=' + id;

      const data = await fetchApi(chapterListUrl);
      const chapterlist = await data.text();

      loadedCheerio = parseHTML(chapterlist);

      loadedCheerio('select > option').each(function () {
        const chapterName = loadedCheerio(this).text();
        const chapterUrl = loadedCheerio(this).attr('value')?.slice(1);
        if (!chapterUrl) return;

        chapter.push({
          name: chapterName,
          path: chapterUrl,
        });
      });
      return chapter;
    };

    novel.chapters = await getChapters(novelId);

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio('#chapter-content div.ads').remove();
    const chapterText = loadedCheerio('#chapter-content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const searchUrl = `${this.site}search?keyword=${searchTerm}&page=${page}`;

    const result = await fetchApi(searchUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    sort: {
      value: 'most-popular',
      label: 'Sort by',
      options: [
        { label: 'Latest Release', value: 'latest-release-novel' },
        { label: 'Hot Novel', value: 'hot-novel' },
        { label: 'Completed Novel', value: 'completed-novel' },
        { label: 'Most Popular', value: 'most-popular' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: '',
      label: 'Genres',
      options: [
        { label: 'None', value: '' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Harem', value: 'Harem' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Martial Arts', value: 'Martial+Arts' },
        { label: 'School Life', value: 'School+Life' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Shoujo', value: 'Shoujo' },
        { label: 'Romance', value: 'Romance' },
        { label: 'Sci-fi', value: 'Sci-fi' },
        { label: 'Gender Bender', value: 'Gender+Bender' },
        { label: 'Mature', value: 'Mature' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Tragedy', value: 'Tragedy' },
        { label: 'Supernatural', value: 'Supernatural' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Xuanhuan', value: 'Xuanhuan' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Action', value: 'Action' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Xianxia', value: 'Xianxia' },
        { label: 'Wuxia', value: 'Wuxia' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Slice of Life', value: 'Slice+of+Life' },
        { label: 'Seinen', value: 'Seinen' },
        { label: 'Lolicon', value: 'Lolicon' },
        { label: 'Adult', value: 'Adult' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Sports', value: 'Sports' },
        { label: 'Smut', value: 'Smut' },
        { label: 'Mecha', value: 'Mecha' },
        { label: 'Yaoi', value: 'Yaoi' },
        { label: 'Shounen Ai', value: 'Shounen+Ai' },
        { label: 'History', value: 'History' },
        { label: 'Martial', value: 'Martial' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new NovelFull();
