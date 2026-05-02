import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

enum APIAction {
  novels = 'load_novels',
  search = 'live_novel_search',
}

type APIParams = {
  action: APIAction;
  params: Record<string, string | number>;
};

type ChapterJSON = {
  items: ChapterItem[];
  total: number;
  total_pages?: number;
  page?: number;
  per_page?: number;
  order?: string;
};

type ChapterItem = {
  id: number;
  title: string;
  url: string;
  locked: boolean;
};

class CrimsonScrollsPlugin implements Plugin.PluginBase {
  id = 'crimsonscrolls';
  name = 'Crimson Scrolls';
  icon = 'src/en/crimsonscrolls/icon.png';
  site = 'https://crimsonscrolls.net';
  version = '1.0.1';

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
      formData.append(key, value.toString());

    const result = await fetchApi(`${this.site}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      body: formData,
    }).then(result => result.json());

    return parseHTML(result.html);
  }

  async fetchChapters(
    id: number,
    page?: number | undefined,
  ): Promise<ChapterItem[]> {
    const url = `${this.site}/wp-json/cs/v1/novels/${id}/chapters?per_page=75&order=asc`;
    const data: ChapterJSON = await fetchApi(`${url}&page=${page ?? 1}`).then(
      r => r.json(),
    );

    const items = data.items || [];
    const locked = items.some(e => e.locked);

    if (
      data.total_pages &&
      (data.page ?? 1) < data.total_pages &&
      !(locked && this.hideLocked)
    ) {
      const nextItems = await this.fetchChapters(id, (data.page ?? 0) + 1);
      return items.concat(nextItems);
    }

    return items;
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
          path: novelUrl
            ? new URL(novelUrl, this.site).pathname.substring(1)
            : defaultCover,
        };
        novels.push(novel);
      },
    );
    return novels;
  }

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    const loadedCheerio = await this.queryAPI({
      action: APIAction.novels,
      params: { page: page.toString() },
    });
    return this.parseNovels(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(`${this.site}/${novelPath}`).then(r =>
      r.text(),
    );

    const loadedCheerio = parseHTML(result);
    const novelInfo = loadedCheerio('#single-novel-content-wrapper');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: novelInfo.find('h1').text().trim() ?? 'Untitled',
      cover:
        novelInfo.find('img:first').data('src')?.toString() ?? defaultCover,
      summary: novelInfo.find('#synopsis-full').text().trim(),
      author: novelInfo.find('strong:first').next().text().trim(),
      chapters: [],
    };

    novel.genres = novelInfo
      .find('.cs-genre-chip')
      .map((_, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(',');

    const rawStatus = novelInfo.find('.cs-nsb-badge').text().trim();
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
      cancelled: NovelStatus.Cancelled,
      completed: NovelStatus.Completed,
    };
    novel.status = map[rawStatus.toLowerCase()] ?? NovelStatus.Unknown;

    const id = loadedCheerio('#chapter-list').data('novel');
    const chapters = await this.fetchChapters(Number(id));

    const novelChapters: Plugin.ChapterItem[] = [];
    chapters.forEach((chapter, index) => {
      if (!(chapter.locked && this.hideLocked)) {
        novelChapters.push({
          name: chapter.locked ? `🔒 ${chapter.title}` : chapter.title,
          path: chapter.url
            ? new URL(chapter.url, this.site).pathname.split('/')[2]
            : '',
          chapterNumber: index + 1,
        });
      }
    });
    novel.chapters = novelChapters;

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

  // not sure purpose of this, commented out
  // resolveUrl = (path: string, isNovel?: boolean) =>
  //   this.site + '/novel/' + path;
}

export default new CrimsonScrollsPlugin();
