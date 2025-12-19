import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { storage } from '@libs/storage';
import dayjs from 'dayjs';

enum APIAction {
  novels = 'load_novels',
  search = 'live_novel_search',
}

interface APIParams {
  action: APIAction;
  params: Record<string, string | number>;
}

class CrimsonScrollsPlugin implements Plugin.PluginBase {
  id = 'crimsonscrolls';
  name = 'Crimson Scrolls';
  icon = 'src/en/crimsonscrolls/icon.png';
  site = 'https://crimsonscrolls.net';
  version = '1.0.0';

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  async queryAPI(query: APIParams): Promise<CheerioAPI> {
    const formData = new FormData();
    formData.append('action', query.action);
    for (const [key, value] of Object.entries(query.params))
      formData.append(key, value);

    const result = await fetchApi(`${this.site}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      body: formData,
    }).then(result => result.json());

    return parseHTML(result.html);
  }

  async fetchChapters(id: number, page?: number | undefined) {
    const chapter: any[] = [];
    const url = `${this.site}/wp-json/cs/v1/novels/${id}/chapters?per_page=75&order=asc`; //page=${page}
    const data = await fetchApi(`${url}&page=${page || 1}`).then(r => r.json());
    const locked = data.items.some(e => e.locked);

    if (data.page < data.total_pages && !(locked && this.hideLocked))
      return data.items.concat(
        await this.fetchChapters(id, parseInt(data.page) + 1),
      );
    else return data.items;
  }

  parseNovels(loadedCheerio: CheerioAPI) {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio(':is(a.live-search-item, div.novel-list-card)').each(
      (i, el) => {
        const novelName = loadedCheerio(el)
          .find(':is(div.live-search-title, h3.novel-title)')
          .text()
          .trim();
        const novelCover = loadedCheerio(el)
          .find(':is(img.live-search-cover, div.novel-cover img)')
          .attr('src');
        const novelUrl =
          loadedCheerio(el).find('a').attr('href') ||
          loadedCheerio(el).attr('href');

        if (!novelUrl) return;

        const novel = {
          name: novelName
            .trim()
            .split(' ')
            .filter(e => e.length > 0)
            .join(' '),
          cover: novelCover,
          path: novelUrl.replace(this.site, '').split('/').at(2),
        };
        novels.push(novel);
      },
    );
    return novels;
  }

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    const loadedCheerio = await this.queryAPI({
      action: APIAction.novels,
      params: { page: page as string },
    });
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(`${this.site}/novel/${novelPath}`).then(r =>
      r.text(),
    );

    let loadedCheerio = parseHTML(result);
    let novelInfo = loadedCheerio('#single-novel-content-wrapper');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: novelInfo.find('h1.chapter-title').text().trim() || 'Untitled',
      cover: novelInfo.find('.single-novel-cover > img').data('src'),
      summary: novelInfo.find('#synopsis-full').text().trim(),
      author: novelInfo
        .find('.single-novel-meta strong')
        .filter(
          (i, el) =>
            loadedCheerio(el).text().toLowerCase().search('author') >= 0,
        )[0]
        .next.data.trim(),
      chapters: [],
    };

    novel.genres = novelInfo
      .find('.single-novel-meta strong')
      .filter(
        (i, el) => loadedCheerio(el).text().toLowerCase().search('genre') >= 0,
      )[0]
      .next.data.split(',')
      .map(e => e.trim())
      .join(',');

    novel.status = 'Unknown';
    const id = loadedCheerio('#chapter-list').data('novel');
    const chapters = await this.fetchChapters(id);

    novel.chapters = [];
    for (const idx in chapters) {
      if (!(chapters[idx].locked && this.hideLocked)) {
        novel.chapters.push({
          name: chapters[idx].locked
            ? `🔒 ${chapters[idx].title}`
            : chapters[idx].title,
          path: chapters[idx].url.replace(this.site, '').split('/').at(2),
          chapterNumber: parseInt(idx) + 1,
        });
      }
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(`${this.site}/chapter/${chapterPath}`).then(r =>
      r.text(),
    );
    const loadedCheerio = parseHTML(body);
    for (const i of [
      'hr.cs-attrib-divider',
      'div.cs-attrib',
      'p.cs-chapter-attrib',
    ])
      loadedCheerio(`#chapter-display ${i}:last`).remove();

    const chapterText = loadedCheerio('#chapter-display').html() || '';
    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const loadedCheerio = await this.queryAPI({
      action: APIAction.search,
      params: { query: searchTerm },
    });

    return this.parseNovels(loadedCheerio);
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + '/novel/' + path;
}

export default new CrimsonScrollsPlugin();
