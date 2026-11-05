import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type SeriesJSON = {
  slug: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  status?: string | null;
  author?: string | null;
  genres?: string[] | null;
};

type SeriesListJSON = {
  data?: SeriesJSON[];
};

type ChapterJSON = {
  number: number;
  title?: string | null;
  published_at?: string | null;
  is_locked?: boolean;
};

type SeriesDetailJSON = {
  series: SeriesJSON;
  chapters?: ChapterJSON[];
};

type ChapterContentJSON = {
  content_html?: string | null;
  is_locked?: boolean;
};

const PAGE_SIZE = 20;

class AsuraScansPlugin implements Plugin.PluginBase {
  id = 'asurascans';
  name = 'Asura Scans';
  icon = 'src/en/asurascans/icon.png';
  site = 'https://asurascans.com';
  apiUrl = 'https://api.asurascans.com/api';
  version = '1.0.0';

  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  async fetchJSON<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Asura Scans request failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  async browse(
    page: number,
    params: URLSearchParams,
  ): Promise<Plugin.NovelItem[]> {
    params.set('limit', PAGE_SIZE.toString());
    params.set('offset', ((page - 1) * PAGE_SIZE).toString());
    const data = await this.fetchJSON<SeriesListJSON>(
      `${this.apiUrl}/novel-series?${params.toString()}`,
    );
    return (data.data || []).map(series => ({
      name: series.title,
      cover: series.cover_url || defaultCover,
      path: `novels/${series.slug}`,
    }));
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      sort: showLatestNovels ? 'update' : filters.sort.value,
    });
    if (filters.status.value) params.set('status', filters.status.value);
    if (filters.genres.value.length) {
      params.set('genres', filters.genres.value.join(','));
    }
    return this.browse(page, params);
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.browse(page, new URLSearchParams({ search: searchTerm }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/').pop() || '';
    const { series, chapters = [] } = await this.fetchJSON<SeriesDetailJSON>(
      `${this.apiUrl}/novel-series/${encodeURIComponent(slug)}`,
    );

    const statusMap: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      complete: NovelStatus.Completed,
      completed: NovelStatus.Completed,
      hiatus: NovelStatus.OnHiatus,
      dropped: NovelStatus.Cancelled,
    };

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: series.title || 'Untitled',
      cover: series.cover_url || defaultCover,
      author: series.author || undefined,
      genres: (series.genres || []).join(','),
      status:
        statusMap[(series.status || '').toLowerCase()] ?? NovelStatus.Unknown,
      chapters: [],
    };

    if (series.description) {
      const $ = parseHTML(series.description);
      novel.summary = $('p')
        .map((_, el) => $(el).text().trim())
        .toArray()
        .filter(text => text)
        .join('\n\n');
      if (!novel.summary) novel.summary = $.root().text().trim();
    }

    const hideLocked = storage.get('hideLocked');
    novel.chapters = chapters
      .filter(chapter => !(chapter.is_locked && hideLocked))
      .map(chapter => {
        const title = chapter.title?.trim();
        const name = `Chapter ${chapter.number}${title ? `: ${title}` : ''}`;
        return {
          name: chapter.is_locked ? `🔒 ${name}` : name,
          path: `novels/${slug}/chapter/${chapter.number}`,
          releaseTime: chapter.published_at || null,
          chapterNumber: chapter.number,
        };
      });

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [, slug, , number] = chapterPath.split('/');
    const chapter = await this.fetchJSON<ChapterContentJSON>(
      `${this.apiUrl}/novel-series/${encodeURIComponent(slug)}/chapter/${number}`,
    );

    if (!chapter.content_html) {
      throw new Error(
        chapter.is_locked
          ? 'This chapter is locked. Unlock it on Asura Scans to read it.'
          : 'This chapter has no content.',
      );
    }

    return this.cleanChapter(chapter.content_html);
  }

  cleanChapter(html: string): string {
    const $ = parseHTML(html);
    // Some chapters end with a paragraph of leaked site navigation and report
    // dialog text. Only trailing paragraphs carrying both markers are dropped.
    let last = $('p').last();
    while (
      last.length &&
      last.text().includes('Back to homepage') &&
      last.text().includes('Reporting chapter:')
    ) {
      last.remove();
      last = $('p').last();
    }
    $('script, style, iframe').remove();

    return $('body').html() || '';
  }

  resolveUrl = (path: string) =>
    /^https?:\/\//i.test(path)
      ? path
      : `${this.site}/${path.replace(/^\/+/, '')}`;

  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort by',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'Latest Update', value: 'update' },
        { label: 'Rating', value: 'rating' },
        { label: 'Newest', value: 'newest' },
        { label: 'Name', value: 'name' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'complete' },
        { label: 'Hiatus', value: 'hiatus' },
      ],
    },
    genres: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genres (all selected must match)',
      value: [],
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Dark Fantasy', value: 'dark-fantasy' },
        { label: 'Demon', value: 'demon' },
        { label: 'Drama', value: 'drama' },
        { label: 'Dungeons', value: 'dungeons' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Game', value: 'game' },
        { label: 'Genius MC', value: 'genius-mc' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Magic', value: 'magic' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Murim', value: 'murim' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Overpowered', value: 'overpowered' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Regression', value: 'regression' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Revenge', value: 'revenge' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Transmigration', value: 'transmigration' },
        { label: 'Villain', value: 'villain' },
      ],
    },
  } satisfies Filters;
}

export default new AsuraScansPlugin();
