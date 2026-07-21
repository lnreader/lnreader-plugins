import { fetchApi } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { storage } from '@libs/storage';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';

type ImageKeys = {
  featured_image?: string | null;
  featured_image_key?: string | null;
  featured_image_thumb_small_key?: string | null;
  featured_image_thumb_medium_key?: string | null;
};

type NovelSummary = ImageKeys & {
  id: number;
  title: string;
  slug: string;
  novel_status?: string | null;
};

type Chapter = {
  id: number;
  title: string;
  slug: string;
  status: string;
  sort_order?: number;
  is_locked?: boolean;
  user_has_access?: boolean;
  scheduled_for?: string | null;
  created_at?: string | null;
};

type Volume = {
  order?: number;
  chapters?: Chapter[];
};

type NovelDetails = NovelSummary & {
  author_name?: string | null;
  description?: string | null;
  genres?: { name: string }[];
  tags?: { name: string }[];
  volumes?: Volume[];
  chapters_pagination?: {
    last_page?: number;
  };
};

type ChapterDetails = {
  id: number;
  title: string;
  content?: string | null;
  locked?: boolean;
  is_locked?: boolean;
  user_has_access?: boolean;
};

type DataResponse<T> = {
  data: T;
};

type SearchResponse<T> = {
  results: T[];
};

class KonkonPlugin implements Plugin.PluginBase {
  id = 'konkon';
  name = 'Konkon';
  icon = 'src/en/konkon/icon.png';
  site = 'https://konkon.ink';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };
  hideLocked = storage.get('hideLocked');

  private api = 'https://api-k.konkon.ink';
  private pageSize = 20;

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetchApi(this.api + path, {
      headers: {
        Accept: 'application/json',
        Referer: this.site + '/',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Could not reach Konkon (${response.status}). Try opening the site in webview.`,
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(
        'Konkon returned an unexpected response. Try opening the site in webview.',
      );
    }

    return (await response.json()) as T;
  }

  private encodeBase64(input: string): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';

    for (
      let block = 0, charCode, index = 0, map = chars;
      input.charAt(index | 0) || ((map = '='), index % 1);
      output += map.charAt(63 & (block >> (8 - (index % 1) * 8)))
    ) {
      charCode = input.charCodeAt((index += 3 / 4));
      if (charCode > 0xff) {
        throw new Error('Could not encode Konkon media path.');
      }
      block = (block << 8) | charCode;
    }

    return output;
  }

  private coverUrl(novel: ImageKeys): string {
    const key =
      novel.featured_image_thumb_medium_key ||
      novel.featured_image_key ||
      novel.featured_image_thumb_small_key ||
      novel.featured_image;

    if (!key) return defaultCover;
    return `${this.api}/api/media/k/${this.encodeBase64(key)}`;
  }

  private toNovelItem(novel: NovelSummary): Plugin.NovelItem {
    return {
      name: novel.title || 'Untitled',
      path: `/read/${novel.slug}`,
      cover: this.coverUrl(novel),
    };
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (showLatestNovels) {
      const response = await this.getJson<DataResponse<NovelSummary[]>>(
        `/api/public/latest-updates?per_page=${this.pageSize}&page=${pageNo}`,
      );
      return response.data.map(novel => this.toNovelItem(novel));
    }

    const limit = pageNo * this.pageSize;
    const response = await this.getJson<DataResponse<NovelSummary[]>>(
      `/api/public/novels_trending?limit=${limit}`,
    );
    return response.data
      .slice((pageNo - 1) * this.pageSize, limit)
      .map(novel => this.toNovelItem(novel));
  }

  private status(status?: string | null): string {
    switch (status?.toLowerCase()) {
      case 'ongoing':
        return NovelStatus.Ongoing;
      case 'completed':
      case 'complete':
        return NovelStatus.Completed;
      case 'cancelled':
      case 'canceled':
        return NovelStatus.Cancelled;
      case 'hiatus':
      case 'on hiatus':
        return NovelStatus.OnHiatus;
      default:
        return NovelStatus.Unknown;
    }
  }

  private readerHtml(html: string): string {
    const content = parseHTML(html, undefined, false);
    content('script, style').remove();
    content('[style]').each((_, element) => {
      const style = content(element).attr('style') || '';
      const readerSafeStyle = style
        .replace(/(^|;)\s*color\s*:[^;]*/gi, '$1')
        .replace(/;{2,}/g, ';')
        .replace(/^\s*;|;\s*$/g, '')
        .trim();

      if (readerSafeStyle) content(element).attr('style', readerSafeStyle);
      else content(element).removeAttr('style');
    });
    return content.root().html() || html;
  }

  private summaryText(html: string): string {
    const content = parseHTML(html, undefined, false);
    const paragraphs = content('p')
      .map((_, element) => content(element).text().trim())
      .get()
      .filter(Boolean);
    return (
      paragraphs.length ? paragraphs.join('\n\n') : content.text()
    ).trim();
  }

  private async getNovelPage(
    slug: string,
    pageNo: number,
  ): Promise<NovelDetails> {
    const response = await this.getJson<DataResponse<NovelDetails>>(
      `/api/public/novels/${encodeURIComponent(slug)}?page=${pageNo}&per_page=100`,
    );
    return response.data;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/?read\//, '').split(/[?#]/)[0];
    const firstPage = await this.getNovelPage(slug, 1);
    const lastPage = Math.max(
      1,
      Number(firstPage.chapters_pagination?.last_page) || 1,
    );
    const pages = [firstPage];

    for (let pageNo = 2; pageNo <= lastPage; pageNo += 1) {
      pages.push(await this.getNovelPage(slug, pageNo));
    }

    const chapters = pages
      .flatMap(page => page.volumes || [])
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .flatMap(volume =>
        [...(volume.chapters || [])].sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
        ),
      )
      .filter(chapter => chapter.status === 'published')
      .filter(
        chapter =>
          !this.hideLocked || !chapter.is_locked || chapter.user_has_access,
      )
      .map((chapter, index): Plugin.ChapterItem => {
        const locked = Boolean(chapter.is_locked && !chapter.user_has_access);
        return {
          name: `${locked ? '🔒 ' : ''}${chapter.title}`,
          path: `/read/chapter/${chapter.id}/${chapter.slug}`,
          chapterNumber: index + 1,
          releaseTime: chapter.scheduled_for || chapter.created_at || null,
        };
      });

    const genres = [...(firstPage.genres || []), ...(firstPage.tags || [])]
      .map(item => item.name)
      .filter((name, index, all) => name && all.indexOf(name) === index)
      .join(', ');

    return {
      name: firstPage.title || 'Untitled',
      path: `/read/${firstPage.slug}`,
      cover: this.coverUrl(firstPage),
      author: firstPage.author_name || undefined,
      genres,
      summary: firstPage.description
        ? this.summaryText(firstPage.description)
        : undefined,
      status: this.status(firstPage.novel_status),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterId = chapterPath.match(/\/read\/chapter\/(\d+)/)?.[1];
    if (!chapterId) throw new Error('Invalid chapter path.');

    const response = await this.getJson<DataResponse<ChapterDetails>>(
      `/api/public/chapters/${chapterId}`,
    );
    const chapter = response.data;

    if ((chapter.locked || chapter.is_locked) && !chapter.user_has_access) {
      throw new Error('This chapter is locked.');
    }
    if (!chapter.content) {
      throw new Error('Konkon returned no chapter content.');
    }

    return this.readerHtml(chapter.content);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const response = await this.getJson<SearchResponse<NovelSummary>>(
      `/api/public/search?q=${encodeURIComponent(searchTerm.trim())}`,
    );

    return response.results.map(novel => this.toNovelItem(novel));
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new KonkonPlugin();
