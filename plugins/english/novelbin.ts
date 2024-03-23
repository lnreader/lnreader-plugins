import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelBin implements Plugin.PluginBase {
  id = 'novelbin';
  name = 'Novel Bin';
  icon = 'src/en/novelbin/icon.png';
  site = 'https://binnovel.com/';
  version = '1.0.0';
  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.col-novel-main .list-novel .row').each((i, el) => {
      const novelName = loadedCheerio(el).find('h3.novel-title > a').text();
      const novelCover = loadedCheerio(el).find('img.cover').attr('src');
      const novelUrl = loadedCheerio(el)
        .find('h3.novel-title > a')
        .attr('href');

      if (!novelUrl) return;

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ''),
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
    if (filters.genre.value !== '') link += `gen/${filters.genre.value}`;
    else link += `sort/${filters.sort.value}`;

    if (filters.complete.value) link += `/completed`;

    link += `?page=${page}`;

    const body = await fetchApi(link).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('div.book > img').attr('alt') || 'Untitled',
      cover: loadedCheerio('div.book > img').attr('src'),
      summary: loadedCheerio('div.desc-text').text().trim(),
      chapters: [],
    };

    loadedCheerio('ul.info > li > h3').each(function () {
      let detailName = loadedCheerio(this).text();
      let detail = loadedCheerio(this)
        .siblings()
        .map((i, el) => loadedCheerio(el).text())
        .toArray()
        .join(',');

      switch (detailName) {
        case 'Author:':
          novel.author = detail;
          break;
        case 'Status:':
          novel.status = detail;
          break;
        case 'Genre:':
          novel.genres = detail;
          break;
      }
    });

    const novelId = loadedCheerio('#rating').attr('data-novel-id');

    const getChapters = async (id: string) => {
      const chapterListUrl = this.site + 'ajax/chapter-archive?novelId=' + id;

      const data = await fetchApi(chapterListUrl);
      const chapterdata = await data.text();

      loadedCheerio = parseHTML(chapterdata);

      const chapter: Plugin.ChapterItem[] = [];

      loadedCheerio('ul.list-chapter > li').each((i, el) => {
        const chapterName = loadedCheerio(el).find('a').attr('title');
        const chapterUrl = loadedCheerio(el).find('a').attr('href');

        if (!chapterName || !chapterUrl) return;

        chapter.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ''),
        });
      });
      return chapter;
    };

    if (novelId) {
      novel.chapters = await getChapters(novelId);
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    loadedCheerio('#chr-content > div,h6,p[style="display: none;"]').remove();
    const chapterText = loadedCheerio('#chr-content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search/?keyword=${searchTerm}`;
    const body = await fetchApi(url).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    sort: {
      value: 'popular-novels',
      label: 'Sort by',
      options: [
        { label: 'Latest Release', value: 'update' },
        { label: 'Hot Novel', value: 'hot-novels' },
        { label: 'Completed Novel', value: 'c' },
        { label: 'Most Popular', value: 'popular-novels' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      value: '',
      label: 'Genres',
      options: [
        { label: 'None', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Anime', value: 'anime' },
        { label: 'Arts', value: 'arts' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fan-fiction', value: 'fan-fiction' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantas', value: 'fantas' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Gender bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Hentai', value: 'hentai' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Lgbt+', value: 'lgbt+' },
        { label: 'Litrpg', value: 'litrpg' },
        { label: 'Magic', value: 'magic' },
        { label: 'Magical realism', value: 'magical-realism' },
        { label: 'Manhua', value: 'manhua' },
        { label: 'Martial arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Military', value: 'military' },
        { label: 'Modern life', value: 'modern-life' },
        { label: 'Movies', value: 'movies' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Portal fantasy', value: 'portal-fantasy' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Realistic fiction', value: 'realistic-fiction' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen ai', value: 'shounen-ai' },
        { label: 'Slice of life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban life', value: 'urban-life' },
        { label: 'Video games', value: 'video-games' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
    complete: {
      label: 'Show Completed Novels Only',
      value: false,
      type: FilterTypes.Switch,
    },
  } satisfies Filters;
}

export default new NovelBin();
