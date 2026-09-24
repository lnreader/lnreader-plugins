import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

type ApiNovel = {
  slug: string;
  title: string;
  image_url?: string | null;
  status?: string | null;
  author?: string | null;
  description?: string | null;
  has_ai?: boolean;
  categories?: { name: string }[];
  editions?: { edition_name: string }[];
};

type ApiPage<T> = {
  total: number;
  page: number;
  size: number;
  items: T[];
};

type ApiChapter = {
  chapter_number: number;
  title?: string | null;
  update_time?: string | null;
  content?: string | null;
  /** Set (e.g. "verify_now") when the site wants a Turnstile check first. */
  trust_challenge?: string | null;
};

const VERIFY_MESSAGE =
  'Cloudflare protection detected (HTTP error). Please try opening the plugin in WebView first to solve the challenge.';

/**
 * The site is a Next.js front-end over a JSON API (`/api/...`); everything
 * here talks to the API directly. A novel can have several editions:
 * `translate` (human), `ai` and `convert`. The site addresses them as
 * `/doc-truyen/<slug>` (translate when present, otherwise the default),
 * `/doc-truyen/ai/<slug>` and `/doc-truyen/cv/<slug>`; paths returned by this
 * plugin follow the same shape so they resolve on the site as-is.
 */
type Edition = '' | 'ai' | 'cv';

const EDITION_TYPE: Record<Edition, string | undefined> = {
  '': undefined,
  ai: 'ai',
  cv: 'convert',
};

class TruyenDichPlugin implements Plugin.PluginBase {
  id = 'truyendich';
  name = 'TruyenDich';
  icon = 'src/vi/truyendich/icon.png';
  site = 'https://truyendich.space';
  version = '1.0.0';

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetchApi(this.site + path);
    if (res.status === 429) {
      throw new Error(
        'truyendich.space rate limited the request (HTTP 429), try again later.',
      );
    }
    const body = await res.text();
    let data: T & { detail?: unknown };
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`${path} -> HTTP ${res.status}, not JSON`);
    }
    if (data?.detail === 'VERIFY_HUMAN') {
      throw new Error(VERIFY_MESSAGE);
    }
    if (!res.ok) {
      throw new Error(`${path} -> HTTP ${res.status}`);
    }
    return data;
  }

  private novelPath(slug: string, edition: Edition): string {
    return 'doc-truyen/' + (edition ? edition + '/' : '') + slug;
  }

  private parsePath(novelPath: string): { slug: string; edition: Edition } {
    const m = novelPath.match(/^\/?doc-truyen\/(?:(ai|cv)\/)?([^/]+)/);
    if (!m) {
      throw new Error('Unrecognised path: ' + novelPath);
    }
    return { slug: m[2], edition: (m[1] as Edition) || '' };
  }

  private toNovelItem(item: ApiNovel, edition: Edition): Plugin.NovelItem {
    return {
      name: item.title,
      path: this.novelPath(item.slug, edition),
      cover: item.image_url ? this.site + item.image_url : defaultCover,
    };
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const list = showLatestNovels ? 'truyen-moi' : filters.list.value;
    const edition = filters.edition.value as Edition;
    const page = await this.getJson<ApiPage<ApiNovel>>(
      `/api/lists/${list}?page=${pageNo}&size=24`,
    );
    return page.items.map(item => this.toNovelItem(item, edition));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const { slug, edition } = this.parsePath(novelPath);
    const data = await this.getJson<ApiNovel>(
      `/api/novels/${encodeURIComponent(slug)}`,
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: data.title,
      cover: data.image_url ? this.site + data.image_url : defaultCover,
      author: data.author || undefined,
      genres: data.categories?.map(c => c.name).join(', ') || undefined,
      summary: data.description
        ? data.description
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        : undefined,
      status:
        data.status === 'ongoing'
          ? NovelStatus.Ongoing
          : data.status === 'completed'
            ? NovelStatus.Completed
            : NovelStatus.Unknown,
    };

    // Chapter pages are capped at 200 entries; long series run into the
    // thousands, so the remaining pages are fetched a few at a time.
    const PAGE_SIZE = 200;
    const CONCURRENT_PAGES = 4;
    const editionQuery = EDITION_TYPE[edition]
      ? '&edition_type=' + EDITION_TYPE[edition]
      : '';
    const chaptersUrl = (page: number) =>
      `/api/novels/${encodeURIComponent(slug)}/chapters?page=${page}&size=${PAGE_SIZE}${editionQuery}`;

    const first = await this.getJson<ApiPage<ApiChapter>>(chaptersUrl(1));
    const pages: ApiChapter[][] = [first.items];
    const pageCount = Math.ceil(first.total / PAGE_SIZE);
    for (let p = 2; p <= pageCount; p += CONCURRENT_PAGES) {
      const batch: Promise<ApiPage<ApiChapter>>[] = [];
      for (let q = p; q < p + CONCURRENT_PAGES && q <= pageCount; q++) {
        batch.push(this.getJson<ApiPage<ApiChapter>>(chaptersUrl(q)));
      }
      const results = await Promise.all(batch);
      pages.push(...results.map(r => r.items));
    }

    novel.chapters = pages
      .flat()
      .sort((a, b) => a.chapter_number - b.chapter_number)
      .map(ch => ({
        name: ch.title
          ? `Chapter ${ch.chapter_number}: ${ch.title}`
          : `Chapter ${ch.chapter_number}`,
        path: `${this.novelPath(slug, edition)}/chuong-${ch.chapter_number}`,
        chapterNumber: ch.chapter_number,
        releaseTime: ch.update_time || undefined,
      }));

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const { slug, edition } = this.parsePath(chapterPath);
    const num = chapterPath.match(/\/chuong-(\d+)\s*$/)?.[1];
    if (!num) {
      throw new Error('Unrecognised chapter path: ' + chapterPath);
    }
    const editionQuery = EDITION_TYPE[edition]
      ? '?edition_type=' + EDITION_TYPE[edition]
      : '';
    const data = await this.getJson<ApiChapter>(
      `/api/novels/${encodeURIComponent(slug)}/chapters/${num}${editionQuery}`,
    );

    // After a few chapters the site returns an empty body and asks for a
    // Turnstile check; the app's WebView shares its cookies with fetchApi.
    if (!data.content && data.trust_challenge) {
      throw new Error(VERIFY_MESSAGE);
    }

    // AI editions wrap the text in a <content> tag and use <br>; translated
    // editions are plain text with newlines.
    let content = (data.content || '').replace(/<\/?content>/gi, '').trim();
    if (!/<(br|p)\b/i.test(content)) {
      content = content.replace(/\n/g, '<br>');
    }
    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const page = await this.getJson<ApiPage<ApiNovel>>(
      `/api/novels/search?q=${encodeURIComponent(searchTerm)}&page=${pageNo}&size=24`,
    );
    return page.items.map(item => this.toNovelItem(item, ''));
  }

  resolveUrl = (path: string) => this.site + '/' + path.replace(/^\//, '');

  filters = {
    list: {
      type: FilterTypes.Picker,
      label: 'List',
      value: 'truyen-hot',
      options: [
        { label: 'Hot', value: 'truyen-hot' },
        { label: 'New', value: 'truyen-moi' },
        { label: 'Translated', value: 'truyen-dich' },
        { label: 'AI translated', value: 'truyen-dich-ai' },
        { label: 'Convert', value: 'truyen-convert' },
        { label: 'Completed', value: 'truyen-full' },
      ],
    },
    edition: {
      type: FilterTypes.Picker,
      label: 'Edition',
      value: '',
      options: [
        { label: 'Default (translated if available)', value: '' },
        { label: 'AI translated', value: 'ai' },
        { label: 'Convert', value: 'cv' },
      ],
    },
  } satisfies Filters;
}

export default new TruyenDichPlugin();
