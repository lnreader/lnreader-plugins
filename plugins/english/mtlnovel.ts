import { load as parseHTML } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';

class MTLNovel implements Plugin.PluginBase {
  id = 'mtlnovel';
  name = 'MTL Novel';
  version = '1.0.0';
  icon = 'src/en/mtlnovel/icon.png';
  site = 'https://www.mtlnovel.com/';
  async popularNovels(
    page: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = `${this.site}novel-list/?`;
    link += `orderby=${filters.order.value}`;
    link += `&order=${filters.sort.value}`;
    link += `&status=${filters.storyStatus.value}`;
    link += `&pg=${page}`;

    const headers = new Headers();
    headers.append('Alt-Used', 'www.mtlnovel.com');
    const body = await fetch(link, { headers }).then(result => result.text());

    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('div.box.wide').each((i, el) => {
      const novelName = loadedCheerio(el).find('a.list-title').text().slice(4);
      const novelCover = loadedCheerio(el).find('amp-img').attr('src');
      const novelUrl = loadedCheerio(el).find('a.list-title').attr('href');

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
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const headers = new Headers();
    headers.append('Referer', `${this.site}novel-list/`);
    headers.append('Alt-Used', 'www.mtlnovel.com');

    const body = await fetch(this.site + novelPath, {
      headers,
    }).then(result => result.text());

    let loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.entry-title').text() || 'Untitled',
      cover: loadedCheerio('.nov-head > amp-img').attr('src'),
      summary: loadedCheerio('div.desc > h2').next().text().trim(),
      author: loadedCheerio('#author').text(),
      status: loadedCheerio('#status').text(),
      genres: loadedCheerio('#genre').text().replace(/\s+/g, ''),
      chapters: [],
    };

    const chapterListUrl = this.site + novelPath + 'chapter-list/';

    const getChapters = async () => {
      const listResult = await fetch(chapterListUrl, { headers });
      const listBody = await listResult.text();

      loadedCheerio = parseHTML(listBody);

      const chapter: Plugin.ChapterItem[] = [];

      loadedCheerio('div.ch-list')
        .find('a.ch-link')
        .each((i, el) => {
          const chapterName = loadedCheerio(el).text().replace('~ ', '');
          const releaseDate = null;
          const chapterUrl = loadedCheerio(el).attr('href');
          if (!chapterUrl) return;
          chapter.push({
            path: chapterUrl.replace(this.site, ''),
            name: chapterName,
            releaseTime: releaseDate,
          });
        });
      return chapter.reverse();
    };

    novel.chapters = await getChapters();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const headers = new Headers();
    headers.append('Alt-Used', 'www.mtlnovel.com');
    const body = await fetch(this.site + chapterPath, { headers }).then(r =>
      r.text(),
    );

    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio('div.par').html() || '';

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const headers = new Headers();
    headers.append('Alt-Used', 'www.mtlnovel.com');
    const searchUrl =
      this.site +
      'wp-admin/admin-ajax.php?action=autosuggest&q=' +
      searchTerm +
      '&__amp_source_origin=https%3A%2F%2Fwww.mtlnovel.com';

    const res = await fetch(searchUrl, { headers });
    const result = await res.json();

    const novels: Plugin.NovelItem[] = [];
    interface SearchEntry {
      title: string;
      thumbnail: string;
      permalink: string;
    }
    result.items[0].results.map((item: SearchEntry) => {
      const novelName = item.title.replace(/<\/?strong>/g, '');
      const novelCover = item.thumbnail;
      const novelUrl = item.permalink.replace(this.site, '');

      const novel = { name: novelName, cover: novelCover, path: novelUrl };

      novels.push(novel);
    });

    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    const headers = new Headers();
    headers.append('Alt-Used', 'www.mtlnovel.com');
    return fetchFile(url, { headers });
  }

  filters = {
    order: {
      value: 'view',
      label: 'Order by',
      options: [
        { label: 'Date', value: 'date' },
        { label: 'Name', value: 'name' },
        { label: 'Rating', value: 'rating' },
        { label: 'View', value: 'view' },
      ],
      type: FilterTypes.Picker,
    },
    sort: {
      value: 'desc',
      label: 'Sort by',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    storyStatus: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Complete', value: 'completed' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}
export default new MTLNovel();
