import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@typings/plugin';

class EarlyNovelPlugin implements Plugin.PagePlugin {
  id = 'earlynovel';
  name = 'Early Novel';
  version = '1.0.0';
  icon = 'multisrc/madara/latestnovel.png';
  site = 'https://earlynovel.net/';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.col-truyen-main > .list-truyen > .row').each((i, el) => {
      const novelUrl = loadedCheerio(el)
        .find('h3.truyen-title > a')
        .attr('href');
      const novelName = loadedCheerio(el).find('h3.truyen-title > a').text();
      const novelCover = loadedCheerio(el).find('.lazyimg').attr('data-image');

      if (!novelUrl) return;
      novels.push({
        path: novelUrl,
        name: novelName,
        cover: novelCover,
      });
    });
    return novels;
  }

  parseChapters(loadedCheerio: CheerioAPI) {
    const chapter: Plugin.ChapterItem[] = [];
    loadedCheerio('ul.list-chapter > li').each((i, el) => {
      const chapterName = loadedCheerio(el).find('.chapter-text').text().trim();
      const chapterUrl = loadedCheerio(el).find('a').attr('href')?.slice(1);
      if (!chapterUrl) return;

      chapter.push({
        name: chapterName,
        path: chapterUrl,
      });
    });
    return chapter;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site;

    if (filters.genres.value.length) link += filters.genres.value;
    else link += filters.order.value;

    link += `?page=${pageNo}`;

    const body = await fetchApi(link).then(res => res.text());

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);
    loadedCheerio('.glyphicon-menu-right').closest('li').remove();
    const pagenav = loadedCheerio('.page-nav').prev().find('a');
    const lastPageStr = pagenav.attr('title')?.match(/(\d+)/);
    const lastPage = Number(lastPageStr?.[1] || '0');

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('.book > img').attr('alt') || 'Untitled',
      cover: loadedCheerio('.book > img').attr('src'),
      summary: loadedCheerio('.desc-text').text().trim(),
      chapters: [],
      totalPages: lastPage,
    };

    loadedCheerio('.info > div > h3').each(function () {
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

    novel.chapters = this.parseChapters(loadedCheerio);
    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = this.site + novelPath + '?page=' + page;
    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);
    const chapters = this.parseChapters(loadedCheerio);
    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('#chapter-c').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}search?keyword=${searchTerm}`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return await fetchFile(url);
  }

  filters = {
    order: {
      value: '/most-popular',
      label: 'Order by',
      options: [
        { label: 'Latest Release', value: '/latest-release-novel' },
        { label: 'Hot Novel', value: '/hot-novel' },
        { label: 'Completed Novel', value: '/completed-novel' },
        { label: 'Most Popular', value: '/most-popular' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      value: '',
      label: 'Genre',
      options: [
        { label: 'None', value: '' },
        { label: 'Action', value: '/genre/action-1' },
        { label: 'Adult', value: '/genre/adult-2' },
        { label: 'Adventure', value: '/genre/adventure-3' },
        { label: 'Comedy', value: '/genre/comedy-4' },
        { label: 'Drama', value: '/genre/drama-5' },
        { label: 'Ecchi', value: '/genre/ecchi-6' },
        { label: 'Fantasy', value: '/genre/fantasy-7' },
        { label: 'Gender Bender', value: '/genre/gender-bender-8' },
        { label: 'Harem', value: '/genre/harem-9' },
        { label: 'Historical', value: '/genre/historical-10' },
        { label: 'Horror', value: '/genre/horror-11' },
        { label: 'Josei', value: '/genre/josei-12' },
        { label: 'Martial Arts', value: '/genre/martial-arts-13' },
        { label: 'Mature', value: '/genre/mature-14' },
        { label: 'Mecha', value: '/genre/mecha-15' },
        { label: 'Mystery', value: '/genre/mystery-16' },
        { label: 'Psychological', value: '/genre/psychological-17' },
        { label: 'Romance', value: '/genre/romance-18' },
        { label: 'School Life', value: '/genre/school-life-19' },
        { label: 'Sci-fi', value: '/genre/sci-fi-20' },
        { label: 'Seinen', value: '/genre/seinen-21' },
        { label: 'Shoujo', value: '/genre/shoujo-22' },
        { label: 'Shoujo Ai', value: '/genre/shoujo-ai-23' },
        { label: 'Shounen', value: '/genre/shounen-24' },
        { label: 'Shounen Ai', value: '/genre/shounen-ai-25' },
        { label: 'Slice of Life', value: '/genre/slice-of-life-26' },
        { label: 'Smut', value: '/genre/smut-27' },
        { label: 'Sports', value: '/genre/sports-28' },
        { label: 'Supernatural', value: '/genre/supernatural-29' },
        { label: 'Tragedy', value: '/genre/tragedy-30' },
        { label: 'Wuxia', value: '/genre/wuxia-31' },
        { label: 'Xianxia', value: '/genre/xianxia-32' },
        { label: 'Xuanhuan', value: '/genre/xuanhuan-33' },
        { label: 'Yaoi', value: '/genre/yaoi-34' },
        { label: 'Yuri', value: '/genre/yuri-35' },
        { label: 'Video Games', value: '/genre/video-games-36' },
        { label: 'Magical Realism', value: '/genre/magical-realism-37' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new EarlyNovelPlugin();
