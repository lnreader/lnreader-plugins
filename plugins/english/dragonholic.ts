import { Plugin } from '@/types/plugin';
import { fetchApi, FetchInit } from '@libs/fetch';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type LuminaChapter = {
  id?: string | number;
  name?: string;
  slug?: string;
  heading?: string;
  subtitle?: string;
  chapter_order?: string | number;
  created_at?: string;
  is_premium?: boolean;
};

type LuminaChaptersResponse = {
  success?: boolean;
  data?: {
    success?: boolean;
    chapters?: LuminaChapter[];
    hasMore?: boolean;
  };
  chapters?: LuminaChapter[];
};

type LuminaSearchResult = {
  id?: string | number;
  title?: string;
  url?: string;
  thumbnail?: string;
};

class Dragonholic implements Plugin.PluginBase {
  id = 'dragonholic';
  name = 'Dragonholic';
  icon = 'src/en/dragonholic/icon.png';
  site = 'https://dragonholictranslations.com';
  version = '3.0.0';

  private decodeEntities(text: string): string {
    return text
      .replace(/&#(\d+);/g, (_, code) => {
        try {
          return String.fromCharCode(parseInt(code, 10));
        } catch {
          return _;
        }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
        try {
          return String.fromCharCode(parseInt(code, 16));
        } catch {
          return _;
        }
      })
      .replace(/&(amp|lt|gt|quot|apos|nbsp|#039);/g, (_, entity) => {
        switch (entity) {
          case 'amp':
            return '&';
          case 'lt':
            return '<';
          case 'gt':
            return '>';
          case 'quot':
            return '"';
          case 'apos':
            return "'";
          case 'nbsp':
            return ' ';
          case '#039':
            return "'";
          default:
            return _;
        }
      });
  }

  // Throw (carrying the HTTP status) on a refused response so a block is
  // reported instead of being parsed into a false empty result.
  private async fetchSite(url: string, init?: FetchInit) {
    const res = await fetchApi(url, init);
    if (!res.ok) {
      throw Object.assign(new Error('Request failed: ' + res.status), {
        status: res.status,
      });
    }
    return res;
  }

  private normalizePath(path: string): string {
    return path
      .replace(/\/{2,}/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/^novel\//, '');
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = pageNo > 1 ? this.site + '/?updates_page=' + pageNo : this.site;
    const res = await this.fetchSite(url);
    const body = await res.text();
    const loadedCheerio = loadCheerio(body);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    loadedCheerio('[data-latest-updates-content] a[href*="/series/"]').each(
      (_, element) => {
        const href = loadedCheerio(element).attr('href') || '';
        const match = href.match(/\/series\/([^/]+)\/?/);
        if (!match) return;
        const slug = match[1];
        if (seen.has(slug)) return;
        seen.add(slug);

        const card = loadedCheerio(element).closest('div[class*="rounded"]');
        const name =
          card.find('h3 a').first().text().trim() ||
          loadedCheerio(element).first().text().trim();
        const cover =
          card.find('img').first().attr('src') ||
          loadedCheerio(element).find('img').first().attr('src') ||
          defaultCover;

        if (name) {
          novels.push({ name, path: slug, cover });
        }
      },
    );

    return novels;
  }

  async parseNovel(path: string): Promise<Plugin.SourceNovel> {
    const novelPath = this.normalizePath(path);
    const res = await this.fetchSite(this.resolveUrl(novelPath));
    const body = await res.text();
    const loadedCheerio = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
    };

    novel.name = loadedCheerio('h1').first().text().trim();

    const cover =
      loadedCheerio('[x-data="coverModal()"] img').first().attr('src') ||
      loadedCheerio('h1').parent().parent().find('img').first().attr('src');
    novel.cover = cover || defaultCover;

    novel.author =
      loadedCheerio('a[href*="/author/"]').first().text().trim() || undefined;

    const genres: string[] = [];
    loadedCheerio('a[href*="/genre/"]').each((_, element) => {
      const genre = loadedCheerio(element).text().trim();
      if (genre) genres.push(genre);
    });
    if (genres.length) {
      novel.genres = genres.join(',');
    }

    const statusText = loadedCheerio('div[class*="rounded-full"]')
      .toArray()
      .map(element => loadedCheerio(element).text().trim().toLowerCase())
      .find(text => /ongoing|completed|hiatus|cancelled|dropped/.test(text));
    if (statusText) {
      if (statusText.includes('ongoing')) novel.status = NovelStatus.Ongoing;
      else if (statusText.includes('completed'))
        novel.status = NovelStatus.Completed;
      else if (statusText.includes('hiatus'))
        novel.status = NovelStatus.OnHiatus;
      else novel.status = NovelStatus.Unknown;
    }

    const summary = loadedCheerio('[x-ref="synopsis"] p')
      .toArray()
      .map(element => loadedCheerio(element).text().trim())
      .filter(text => text && !/^synopsis:?$/i.test(text))
      .join('\n');
    if (summary) {
      novel.summary = summary;
    }

    const seriesId = body.match(/seriesId:\s*(\d+)/)?.[1];
    const chapters: Plugin.ChapterItem[] = [];
    if (seriesId) {
      const chaptersRes = await this.fetchSite(
        this.site +
          '/api/chapters?series_id=' +
          seriesId +
          '&load_all=1&sort_order=asc',
        {
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
      );
      const data = (await chaptersRes.json()) as LuminaChaptersResponse;
      const list = data?.data?.chapters || data?.chapters || [];
      list.forEach(item => {
        if (!item.slug) return;
        const order = Number(item.chapter_order);
        const title = this.decodeEntities(
          [item.heading || item.name, item.subtitle]
            .filter(part => part && part.trim())
            .join(' - ') || item.slug,
        );
        chapters.push({
          name: item.is_premium ? '🔒 ' + title : title,
          path: novelPath + '/' + item.slug,
          releaseTime: item.created_at || undefined,
          chapterNumber: order > 0 ? order : chapters.length + 1,
        });
      });
    }
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const res = await this.fetchSite(this.resolveUrl(chapterPath));
    const body = await res.text();
    const loadedCheerio = loadCheerio(body);
    const content = loadedCheerio('.chapter-content');

    content
      .find('script, style, ins, .ad-container, [data-lumina-ad-code]')
      .remove();

    let chapterText = '';
    content.find('p').each((_, element) => {
      const paragraph = loadedCheerio(element);
      if (paragraph.text().trim() || paragraph.find('img').length) {
        chapterText += '<p>' + (paragraph.html() || '').trim() + '</p>';
      }
    });

    return chapterText;
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const res = await this.fetchSite(
      this.site + '/api/search?q=' + encodeURIComponent(searchTerm),
      {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    );
    const data = (await res.json()) as {
      results?: LuminaSearchResult[];
    };
    const novels: Plugin.NovelItem[] = [];

    (data?.results || []).forEach(item => {
      const match = (item.url || '').match(/\/series\/([^/]+)\/?/);
      if (item.title && match) {
        novels.push({
          name: this.decodeEntities(item.title),
          path: match[1],
          cover: item.thumbnail || defaultCover,
        });
      }
    });

    return novels;
  }

  resolveUrl = (path: string) =>
    this.site + '/series/' + this.normalizePath(path) + '/';
}

export default new Dragonholic();
