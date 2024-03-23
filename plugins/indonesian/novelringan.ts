import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class NovelRingan implements Plugin.PluginBase {
  id = 'novelringan.com';
  name = 'NovelRingan';
  icon = 'src/id/novelringan/icon.png';
  site = 'https://novelringan.com/';
  version = '1.0.0';
  coverUriPrefix = 'https://i0.wp.com/novelringan.com/wp-content/uploads/';

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('article.post').each((idx, ele) => {
      const novelName = loadedCheerio(ele).find('.entry-title').text()?.trim();
      const novelCover =
        this.coverUriPrefix + loadedCheerio(ele).find('img').attr('data-sxrx');
      const novelUrl = loadedCheerio(ele).find('h2 > a').attr('href');

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
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}advanced-search/page/${page}/?title`;
    link += `&status=${filters.status.value}`;
    link += `&order=${filters.sort.value}`;

    if (filters.type.value.length)
      link += filters.type.value.map(i => `&type[]=${i}`).join('');
    if (filters.genre.value.length)
      link += filters.genre.value.map(i => `&genre[]=${i}`).join('');

    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const styletag = Array.from(
      loadedCheerio('meta[name=msapplication-TileImage] + style')
        .html()
        ?.matchAll(/"(.*?)"/g) || [],
      m => m[1],
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: styletag[0] || loadedCheerio('.entry-title').text() || 'Untitled',
      author: styletag[1],
      summary: loadedCheerio('.maininfo span p').text(),
      chapters: [],
    };

    novel.cover =
      this.coverUriPrefix +
      loadedCheerio('img.ts-post-image').attr('data-sxrx');

    loadedCheerio('.maininfo li').each(function () {
      let detailName = loadedCheerio(this).find('b').text().trim();
      let detail = loadedCheerio(this).find('b').remove().end().text().trim();

      switch (detailName) {
        case 'Status:':
          novel.status = detail;
          break;
        case 'Genre:':
          novel.genres = detail;
          break;
      }
    });

    const chapter: Plugin.ChapterItem[] = [];

    loadedCheerio('.bxcl > ul > li').each((i, el) => {
      const chapterName = loadedCheerio(el).find('a').text();
      const chapterUrl = loadedCheerio(el).find('a').attr('href');

      if (!chapterUrl) return;

      chapter.push({
        name: chapterName,
        path: chapterUrl.replace(this.site, ''),
      });
    });

    novel.chapters = chapter.reverse();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    loadedCheerio('.entry-content div[style="display:none"]').remove();

    const chapterText = loadedCheerio('.entry-content').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.site + 'page/' + page + '/?s=' + searchTerm;

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    return this.parseNovels(loadedCheerio);
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }

  filters = {
    status: {
      value: '',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'Ongoing' },
        { label: 'Completed', value: 'Completed' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      value: 'popular',
      label: 'Urutkan',
      options: [
        { label: 'A-Z', value: 'title' },
        { label: 'Z-A', value: 'titlereverse' },
        { label: 'Terbarui', value: 'update' },
        { label: 'Ditambahkan', value: 'latest' },
        { label: 'Terpopuler', value: 'popular' },
      ],
      type: FilterTypes.Picker,
    },
    type: {
      value: [],
      label: 'Tipe',
      options: [
        { label: 'Chinese Novel', value: 'chinese-novel' },
        { label: 'Chinese Web Novel', value: 'chinese-web-novel' },
        { label: 'Filipino Novel', value: 'filipino-novel' },
        { label: 'Indonesia Novel', value: 'indonesia-novel' },
        { label: 'Korean Novel', value: 'korean-novel' },
        { label: 'Light Novel', value: 'light-novel' },
        { label: 'Light Novel (CN)', value: 'light-novel-cn' },
        { label: 'Light Novel (JP)', value: 'light-novel-jp' },
        { label: 'Light Novel (KR)', value: 'light-novel-kr' },
        { label: 'Malaysian Novel', value: 'malaysian-novel' },
        { label: 'Published Novel (CN)', value: 'published-novel-cn' },
        { label: 'Published Novel (JP)', value: 'published-novel-jp' },
        { label: 'Published Novel (KR)', value: 'published-novel-kr' },
        { label: 'Published Novel (TH)', value: 'published-novel-th' },
        { label: 'Thai Novel', value: 'thai-novel' },
        { label: 'Vietnamese Novel', value: 'vietnamese-novel' },
        { label: 'Web Novel', value: 'web-novel' },
        { label: 'Webnovel', value: 'webnovel' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
    genre: {
      value: [],
      label: 'Genres',
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Celebrity', value: 'celebrity' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'ction', value: 'ction' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Games', value: 'games' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Life', value: 'life' },
        { label: 'LitRPG', value: 'litrpg' },
        { label: 'Magical Realism', value: 'magical-realism' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychologic', value: 'psychologic' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Recarnation', value: 'recarnation' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Romance', value: 'romance' },
        { label: 'School', value: 'school' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shotacon', value: 'shotacon' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Life', value: 'urban-life' },
        {
          label: 've names:N/A Genre:Romance',
          value: 've-namesn-a-genreromance',
        },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.CheckboxGroup,
    },
  } satisfies Filters;
}

export default new NovelRingan();
