import { load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import dayjs from 'dayjs';

class LightNovelPub implements Plugin.PagePlugin {
  id = 'lightnovelpub';
  name = 'LightNovelPub';
  version = '1.0.1';
  icon = 'src/en/lightnovelpub/icon.png';
  site = 'https://www.lightnovelpub.com/';
  headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}browse/`;
    link += `${filters.genres.value}/`;
    link += `${filters.order.value}/`;
    link += `${filters.status.value}/`;
    link += page;

    const body = await fetchApi(link).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('.novel-item.ads').remove();

    loadedCheerio('.novel-item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.novel-title').text().trim();
      const novelCover = loadedCheerio(ele).find('img').attr('data-src');
      const novelUrl = loadedCheerio(ele)
        .find('.novel-title > a')
        .attr('href')
        ?.substring(1);

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

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await fetchApi(this.site + novelPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);
    const totalChapters = parseInt(
      loadedCheerio('.header-stats span:first strong').text(),
      10,
    );

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: loadedCheerio('h1.novel-title').text().trim() || 'Untitled',
      cover: loadedCheerio('figure.cover > img').attr('data-src'),
      author: loadedCheerio('.author > a > span').text(),
      summary: loadedCheerio('.summary > .content').text().trim(),
      status: loadedCheerio('.header-stats span:last strong').text(),
      totalPages: Math.ceil(totalChapters / 100),
      chapters: [],
    };

    novel.genres = loadedCheerio('.categories ul li')
      .map((a, ex) => loadedCheerio(ex).text().trim())
      .toArray()
      .join(',');

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = this.site + novelPath + '/chapters/page-' + page;
    const body = await fetchApi(url).then(res => res.text());
    const loadedCheerio = parseHTML(body);
    const chapter: Plugin.ChapterItem[] = [];
    loadedCheerio('.chapter-list li').each(function () {
      const chapterName =
        'Chapter ' +
        loadedCheerio(this).find('.chapter-no').text().trim() +
        ' - ' +
        loadedCheerio(this).find('.chapter-title').text().trim();

      const releaseDate = loadedCheerio(this)
        .find('.chapter-update')
        .attr('datetime');

      const chapterUrl = loadedCheerio(this)
        .find('a')
        .attr('href')
        ?.substring(1);
      if (!chapterUrl) return;

      chapter.push({
        name: chapterName,
        path: chapterUrl,
        releaseTime: dayjs(releaseDate).toISOString(),
      });
    });
    const chapters = chapter;
    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then(r => r.text());

    const loadedCheerio = parseHTML(body);

    let chapterText = loadedCheerio('#chapter-container').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}lnsearchlive`;
    const link = `${this.site}search`;
    const response = await fetchApi(link).then(r => r.text());
    const token = parseHTML(response);
    let verifytoken = token('#novelSearchForm > input').attr('value');

    let formData = new FormData();
    formData.append('inputContent', searchTerm);

    const body = await fetchApi(url, {
      method: 'POST',
      headers: { LNRequestVerifyToken: verifytoken! },
      body: formData,
    }).then(r => r.text());

    let loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    let results = JSON.parse(loadedCheerio('body').text());

    loadedCheerio = parseHTML(results.resultview);

    loadedCheerio('.novel-item').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('h4.novel-title').text().trim();
      const novelCover = loadedCheerio(ele).find('img').attr('src');
      const novelUrl = loadedCheerio(ele).find('a').attr('href')?.substring(1);
      if (!novelUrl) return;
      novels.push({
        name: novelName,
        path: novelUrl,
        cover: novelCover,
      });
    });

    return novels;
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url, { headers: this.headers });
  }

  filters = {
    order: {
      value: 'popular',
      label: 'Order by',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Popular', value: 'popular' },
        { label: 'Updates', value: 'updated' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Ongoing', value: 'ongoing' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      value: 'all',
      label: 'Genre',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Drama', value: 'drama' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Harem', value: 'harem' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Romance', value: 'romance' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Josei', value: 'josei' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Horror', value: 'horror' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Historical', value: 'historical' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Adult', value: 'adult' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Sports', value: 'sports' },
        { label: 'Lolicon', value: 'lolicon' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Video Games', value: 'video-games' },
        { label: 'Smut', value: 'smut' },
        { label: 'Magical Realism', value: 'magical-realism' },
        { label: 'Eastern Fantasy', value: 'eastern-fantasy' },
        { label: 'Contemporary Romance', value: 'contemporary-romance' },
        { label: 'Fantasy Romance', value: 'fantasy-romance' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new LightNovelPub();
