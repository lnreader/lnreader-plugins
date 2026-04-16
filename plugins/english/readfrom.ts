import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { CheerioAPI, load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

const pluginHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

class ReadFromPlugin implements Plugin.PluginBase {
  id = 'readfrom';
  name = 'Read From Net';
  icon = 'src/en/readfrom/icon.png';
  site = 'https://readfrom.net/';
  version = '1.1.0';
  filters: Filters | undefined = undefined;
  headers = new Headers(pluginHeaders);
  imageRequestInit: Plugin.ImageRequestInit = {
    headers: pluginHeaders,
  };

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean;

  loadedNovelCache: (Plugin.NovelItem & {
    summary: string;
    genres: string;
    author: string;
  })[] = [];

  parseNovels(
    loadedCheerio: CheerioAPI,
    isSearch?: boolean,
  ): (Plugin.NovelItem & {
    summary: string;
    genres: string;
    author: string;
  })[] {
    const ret = loadedCheerio(
      (isSearch ? 'div.text' : '#dle-content') + ' > article.box',
    )
      .map((i, el) => {
        const $el = loadedCheerio(el);
        const novelPath = $el.find('h2.title a').attr('href');
        if (!novelPath) return;
        const summary = loadedCheerio(el).find(
          isSearch ? 'div.text5' : 'div.text3',
        )[0];
        loadedCheerio(summary).find('.coll-ellipsis').remove();
        loadedCheerio(summary).find('a').remove();
        return {
          name: loadedCheerio(el).find('h2.title').text().trim(),
          path: new URL(novelPath, this.site).pathname.substring(1),
          cover: loadedCheerio(el).find('img').attr('src') || defaultCover,
          summary:
            loadedCheerio(summary).text().trim() +
            loadedCheerio(summary).find('span.coll-hidden').text(),
          genres: loadedCheerio(el)
            .find(isSearch ? 'h5.title > a' : 'h2 > a')
            .filter((i, el) => el.attribs['title']?.startsWith?.('Genre - '))
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(', '),
          author: isSearch
            ? loadedCheerio(el)
                .find('h5.title > a')
                .filter((i, el) =>
                  el.attribs['title']?.startsWith?.('Book author - '),
                )
                .text()
            : loadedCheerio(el).find('h4 > a').text(),
        };
      })
      .toArray();

    this.loadedNovelCache.push(...ret);
    while (this.loadedNovelCache.length > 100) {
      this.loadedNovelCache.shift();
    }

    return ret;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ) {
    const type = showLatestNovels ? 'last_added_books' : 'allbooks';
    const res = await fetchApi(this.site + type + '/page/' + pageNo, {
      headers: this.headers,
    });
    const text = await res.text();
    return this.parseNovels(loadCheerio(text));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const data = await fetchApi(this.site + novelPath, {
      headers: this.headers,
    });
    const text = await data.text();
    const loadedCheerio = loadCheerio(text);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    novel.name = loadedCheerio('center > h2.title')
      .text()
      .split(', \n\n')[0]
      .trim();
    novel.cover =
      loadedCheerio('article.box > div > center > div > a > img').attr('src') ||
      defaultCover;

    const rawChapters = loadedCheerio('div.pages')
      .first()
      .find('> a')
      .toArray()
      .flatMap(el => {
        const href = loadedCheerio(el).attr('href');
        if (!href) return [];

        const path = new URL(href, this.site).pathname.substring(1);
        return path ? [{ name: loadedCheerio(el).text().trim(), path }] : [];
      });

    novel.chapters = [
      { name: '1', path: novelPath, chapterNumber: 1 },
      ...rawChapters.map((ch, i) => ({ ...ch, chapterNumber: i + 2 })),
    ];

    let moreNovelInfo = this.loadedNovelCache.find(
      novel => novel.path === novelPath,
    );
    if (!moreNovelInfo)
      moreNovelInfo = (await this.searchNovels(novel.name, 1)).find(
        novel => novel.path === novelPath,
      );
    if (moreNovelInfo) {
      novel.summary = moreNovelInfo.summary;
      novel.genres = moreNovelInfo.genres;
      novel.author = moreNovelInfo.author;
    }

    const seriesElm = loadedCheerio('center > b:has(a)').filter((i, el) =>
      loadedCheerio(el).find('a').attr('href')!.startsWith('/series.html'),
    )[0];

    if (seriesElm) {
      const seriesText = loadedCheerio(seriesElm).text().trim();

      novel.summary = seriesText + '\n\n' + novel.summary;
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchApi(this.site + chapterPath, {
      headers: this.headers,
    });
    const $ = loadCheerio(await response.text());
    $('#textToRead > span:empty, #textToRead > center').remove();

    const chapterHtml: string[] = [];
    let p: string[] = [];

    const allowed = new Set(['b', 'i', 'u', 'strong', 'em', 'a']);
    const flush = () =>
      p.length && (chapterHtml.push(`<p>${p.join(' ').trim()}</p>`), (p = []));

    for (const el of $('#textToRead').contents().toArray()) {
      switch (el.type) {
        case 'comment':
          continue;
        case 'text':
          if (el.data.trim()) {
            // Convert _text_ to <i>text</i>
            const jbText = el.data.trim().replace(/_([^_]+)_/g, '<i>$1</i>');
            p.push(jbText);
          }
          continue;
        case 'tag':
          if (allowed.has(el.name)) {
            p.push($.html(el));
            continue;
          }
          if (el.name === 'br') {
            flush();
            continue;
          }
      }
      flush();
      chapterHtml.push($.html(el));
    }

    flush();
    return chapterHtml.join('');
  }

  async searchNovels(searchTerm: string, pageNo: number) {
    if (pageNo !== 1) return [];
    const res = await fetchApi(
      'https://readfrom.net/build_in_search/?q=' +
        encodeURIComponent(searchTerm),
      { headers: this.headers },
    );
    const text = await res.text();
    return this.parseNovels(loadCheerio(text), true);
  }

  // resolveUrl = (path: string, isNovel?: boolean) => this.site + '/' + path;
}

export default new ReadFromPlugin();
