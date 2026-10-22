import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type CoteNovelMeta = {
  id: string;
  slug?: string;
  title: string;
  author?: string;
  year?: string;
  volumes?: {
    id: string;
    position?: number;
    title: string;
    slug?: string;
    cover?: string;
    url?: string;
    type?: string;
    section?: string;
  }[];
  tags?: string[];
  genres?: string[];
  cover?: string;
  description?: string;
  popularity?: number;
  source?: string;
};

type VolumeTocItem = {
  title: string;
  chapterIndex: number;
};

type VolumeApiResponse = {
  bookId?: string;
  seriesId?: string;
  seriesTitle?: string;
  volumeTitle?: string;
  toc?: VolumeTocItem[];
  chapters?: Record<string, { index: number; title: string; content: string }>;
};

class CoteReader implements Plugin.PluginBase {
  id = 'cotereader';
  name = 'COTE Reader';
  site = 'https://cote-reader.me';
  icon = 'src/en/cotereader/icon.png';
  version = '1.0.7';

  private canonicalIds = new Set([
    'cote',
    'lotm',
    'rezero',
    'bunny-girl',
    'mushoku-tensei',
    'orv',
    'world',
    'reverend-insanity',
    'apothecary-diaries',
    'tensura',
    'tbate',
    'eightysix',
    'monogatari',
  ]);

  private aliasMap: Record<string, string> = {
    '4557': 'cote',
    '3336': 'mushoku-tensei',
    '3486': 'bunny-girl',
    '1014': 'monogatari',
    '3343': 'rezero',
    '6547': 'eightysix',
    '3580': 'tensura',
    '3768': 'apothecary-diaries',
    '10839': 'lotm',
    '200298': '2958',
  };

  private formatCover(cover?: string): string {
    if (!cover) return defaultCover;
    if (cover.startsWith('http://') || cover.startsWith('https://'))
      return cover;
    if (cover.startsWith('//')) return `https:${cover}`;
    if (cover.startsWith('/')) return `${this.site}${cover}`;
    return `${this.site}/${cover}`;
  }

  // The app passes cover URLs through resolveUrl (EPUB export does
  // this), so absolute and protocol-relative URLs must pass through
  // unchanged — prefixing the site onto them breaks the cover.
  resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    return `${this.site}/${path.replace(/^\/+/, '')}`;
  }

  private cleanId(novelPath: string): string {
    return novelPath
      .replace(/^\/?novel\//i, '')
      .replace(/^\//, '')
      .split('/')[0]
      .trim();
  }

  private async safeJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error(
        'Received empty response from server. Please retry in a moment.',
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error(
          'Server returned an error page instead of novel content. Please retry.',
        );
      }
      throw new Error(
        'Stream interrupted by server (unexpected end of input). Retrying...',
      );
    }
  }

  /**
   * Error with the HTTP status attached. Tooling (e.g. the repo's live
   * check) reads `error.status` to tell a site block or outage (403/503)
   * apart from a plugin bug, so always throw fetch failures this way.
   */
  private httpError(message: string, status: number): Error {
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    return err;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/api/novels?page=${pageNo}&limit=20`;
    if (filters?.tag?.value) {
      url += `&tag=${encodeURIComponent(filters.tag.value)}`;
    }

    const res = await fetchApi(url);
    if (!res.ok) {
      throw this.httpError(
        `Failed to load popular novels: HTTP ${res.status}`,
        res.status,
      );
    }

    const data = await this.safeJson<{ items?: CoteNovelMeta[] }>(res);
    const items = data.items || [];
    const seenPaths = new Set<string>();
    const seenTitles = new Set<string>();
    const result: Plugin.NovelItem[] = [];

    for (const novel of items) {
      const targetId = this.aliasMap[novel.id] || novel.id;
      const path = `/novel/${targetId}`;
      const normTitle = novel.title.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (seenPaths.has(path) || seenTitles.has(normTitle)) {
        continue;
      }
      seenPaths.add(path);
      seenTitles.add(normTitle);

      result.push({
        name: novel.title,
        path,
        cover: this.formatCover(novel.cover),
      });
    }

    return result;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/novels?q=${encodeURIComponent(searchTerm)}&page=${pageNo}&limit=20`;
    const res = await fetchApi(url);
    if (!res.ok) {
      throw this.httpError(
        `Failed to search novels: HTTP ${res.status}`,
        res.status,
      );
    }

    const data = await this.safeJson<{ items?: CoteNovelMeta[] }>(res);
    const items = data.items || [];
    const seenPaths = new Set<string>();
    const seenTitles = new Set<string>();
    const result: Plugin.NovelItem[] = [];

    for (const novel of items) {
      const targetId = this.aliasMap[novel.id] || novel.id;
      const path = `/novel/${targetId}`;
      const normTitle = novel.title.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (seenPaths.has(path) || seenTitles.has(normTitle)) {
        continue;
      }
      seenPaths.add(path);
      seenTitles.add(normTitle);

      result.push({
        name: novel.title,
        path,
        cover: this.formatCover(novel.cover),
      });
    }

    return result;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const rawId = this.cleanId(novelPath);
    const id = this.aliasMap[rawId] || rawId;
    const metaUrl = `${this.site}/api/novels/${id}`;
    const res = await fetchApi(metaUrl);

    if (!res.ok) {
      throw this.httpError(
        `Failed to load novel metadata: HTTP ${res.status}`,
        res.status,
      );
    }

    const data = await this.safeJson<CoteNovelMeta>(res);
    const genres = Array.isArray(data.tags)
      ? data.tags.join(', ')
      : Array.isArray(data.genres)
        ? data.genres.join(', ')
        : undefined;

    // Special handling for webnovels with dedicated chapter summary files (ORV & World)
    if (id === 'orv' || id === 'world') {
      try {
        const sumUrl = `${this.site}/assets/${id}/summary.json`;
        const sumRes = await fetchApi(sumUrl);
        if (sumRes.ok) {
          const summary = await this.safeJson<{
            mainChapters?: { id: string; title: string }[];
            contChapters?: { id: string; title: string }[];
            sideChapters?: { id: string; title: string }[];
          }>(sumRes);

          const allChs = [
            ...(summary.mainChapters || []),
            ...(summary.contChapters || []),
            ...(summary.sideChapters || []),
          ];

          if (allChs.length > 0) {
            const chapters: Plugin.ChapterItem[] = allChs.map((ch, idx) => ({
              name: ch.title,
              path: `/webnovel/${id}/${ch.id}`,
              chapterNumber: idx + 1,
            }));

            return {
              path: novelPath,
              name: data.title,
              cover: this.formatCover(data.cover),
              summary: data.description,
              author: data.author,
              genres,
              status: NovelStatus.Ongoing,
              chapters,
            };
          }
        }
      } catch (e) {
        // Summary file unavailable: fall through to the volume list.
      }
    }

    const volumes = data.volumes || [];
    const isCanonical = this.canonicalIds.has(id.toLowerCase());

    const chapters: Plugin.ChapterItem[] = volumes.map((volume, index) => {
      const position = index + 1;
      const numStr = String(position).padStart(2, '0');
      const rawTitle = volume.title || `Volume ${position}`;
      const name = `Vol. ${numStr}: ${rawTitle}`;

      const path = isCanonical
        ? `/canonical/${id}/${volume.id}`
        : `/api/novels/${id}/volume/${volume.id}`;

      return {
        name,
        path,
        chapterNumber: position,
      };
    });

    return {
      path: novelPath,
      name: data.title,
      cover: this.formatCover(data.cover),
      summary: data.description,
      author: data.author,
      genres,
      status: NovelStatus.Ongoing,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    let rawHtml = '';

    if (chapterPath.startsWith('/webnovel/')) {
      const parts = chapterPath.replace(/^\/webnovel\//, '').split('/');
      const id = parts[0];
      const chapterId = parts[1];

      const chUrl = `${this.site}/assets/${id}/chapters/${chapterId}.json`;
      const res = await fetchApi(chUrl);
      if (!res.ok) {
        throw this.httpError(
          `Failed to fetch chapter: HTTP ${res.status}`,
          res.status,
        );
      }

      const chData = await this.safeJson<{
        contentHtml?: string;
        content?: string;
      }>(res);
      rawHtml = chData.contentHtml || chData.content || '';
    } else if (chapterPath.startsWith('/canonical/')) {
      const parts = chapterPath.replace(/^\/canonical\//, '').split('/');
      const id = parts[0];
      const volumeId = parts[1];
      const chapterKey = parts[2];

      const cacheUrl = `${this.site}/assets/cache/${id}/${volumeId}.json`;
      const res = await fetchApi(cacheUrl);
      if (!res.ok) {
        if (res.status === 404) {
          throw this.httpError(
            'This volume is not yet available on COTE Reader (HTTP 404).',
            404,
          );
        }
        throw this.httpError(
          `Failed to fetch volume: HTTP ${res.status}`,
          res.status,
        );
      }

      const json =
        await this.safeJson<
          Record<string, { title?: string; content?: string }>
        >(res);
      if (chapterKey && json[chapterKey]) {
        rawHtml = json[chapterKey].content || '';
      } else {
        const keys = Object.keys(json).sort((a, b) => Number(a) - Number(b));
        rawHtml = keys
          .map(k => {
            const item = json[k];
            const title = item.title || `Chapter ${k}`;
            return `<section class="volume-chapter"><h2 class="volume-chapter-title">${title}</h2>${item.content || ''}</section>`;
          })
          .join('\n<hr class="volume-divider" />\n');
      }
    } else if (chapterPath.startsWith('/api/novels/')) {
      const parts = chapterPath.replace(/^\/api\/novels\//, '').split('/');
      const id = parts[0];
      const volumeId = parts[2];
      const chapterIndex = parts[3];

      const volUrl = `${this.site}/api/novels/${id}/volume/${volumeId}`;
      let lastErr: Error | null = null;
      let volData: VolumeApiResponse | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetchApi(volUrl);
          if (res.status === 503) {
            lastErr = this.httpError(
              'Remote server is busy (HTTP 503: Cloudflare Worker limit). Please retry in a moment.',
              503,
            );
            await new Promise(resolve =>
              setTimeout(resolve, 1000 * (attempt + 1)),
            );
            continue;
          }
          if (!res.ok) {
            throw this.httpError(
              `Failed to fetch volume: HTTP ${res.status}`,
              res.status,
            );
          }
          volData = await this.safeJson<VolumeApiResponse>(res);
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
          if (attempt < 2) {
            await new Promise(resolve =>
              setTimeout(resolve, 1000 * (attempt + 1)),
            );
          }
        }
      }

      if (!volData) {
        if (lastErr?.message?.includes('503')) {
          throw lastErr;
        }
        throw (
          lastErr ||
          new Error(
            'Failed to load volume: Connection was interrupted. Please retry in a moment.',
          )
        );
      }

      if (chapterIndex && volData.chapters?.[chapterIndex]) {
        rawHtml = volData.chapters[chapterIndex].content || '';
      } else {
        const chaptersObj = volData.chapters || {};
        const toc = volData.toc || [];
        if (toc.length > 0) {
          rawHtml = toc
            .map(item => {
              const ch = chaptersObj[item.chapterIndex];
              return `<section class="volume-chapter"><h2 class="volume-chapter-title">${item.title}</h2>${ch?.content || ''}</section>`;
            })
            .join('\n<hr class="volume-divider" />\n');
        } else {
          const keys = Object.keys(chaptersObj).sort(
            (a, b) => Number(a) - Number(b),
          );
          rawHtml = keys
            .map(
              k =>
                `<section class="volume-chapter">${chaptersObj[k]?.content || ''}</section>`,
            )
            .join('\n<hr class="volume-divider" />\n');
        }
      }
    } else {
      const res = await fetchApi(
        chapterPath.startsWith('http')
          ? chapterPath
          : `${this.site}${chapterPath}`,
      );
      if (res.ok) {
        rawHtml = await res.text();
      }
    }

    return this.sanitizeChapterHtml(rawHtml);
  }

  private sanitizeChapterHtml(html: string): string {
    if (!html) return '';

    let cleaned = html.replace(
      /(<img[^>]+src=["'])(\/assets\/[^"']+)(["'])/gi,
      `$1${this.site}$2$3`,
    );

    cleaned = cleaned.replace(
      /<picture>[\s\S]*?<img([^>]+src=["']https?:\/\/[^"']+["'][^>]*)>[\s\S]*?<\/picture>/gi,
      '<img$1>',
    );

    return cleaned;
  }

  filters = {
    tag: {
      value: '',
      label: 'Genre / Tag',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Dark Fantasy', value: 'Dark Fantasy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Isekai', value: 'Isekai' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Romance', value: 'Romance' },
        { label: 'School', value: 'School' },
        { label: 'Sci-Fi', value: 'Sci-Fi' },
        { label: 'Slice of Life', value: 'Slice of Life' },
        { label: 'Supernatural', value: 'Supernatural' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new CoteReader();
