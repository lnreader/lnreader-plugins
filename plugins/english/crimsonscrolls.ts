import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type ChapterJSON = {
  items?: ChapterItem[];
  total?: number;
  page?: number;
  pages?: number;
  tier?: string;
};

type ChapterItem = {
  id: number;
  number: string;
  title: string;
  url: string;
  date?: string;
  tier?: string;
};

class CrimsonScrollsPlugin implements Plugin.PluginBase {
  id = 'crimsonscrolls';
  name = 'Crimson Scrolls';
  icon = 'src/en/crimsonscrolls/icon.png';
  site = 'https://crimsonscrolls.net';
  version = '1.1.0';

  hideLocked = storage.get('hideLocked');
  pluginSettings = {
    hideLocked: {
      value: '',
      label: 'Hide locked chapters',
      type: 'Switch',
    },
  };

  async fetchPage(url: string): Promise<CheerioAPI> {
    const body = await fetchApi(url).then(r => r.text());
    return parseHTML(body);
  }

  toPath(url: string): string {
    return new URL(url, this.site).pathname.substring(1);
  }

  parseNovels(loadedCheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    loadedCheerio('article.cs-browse-card').each((_, el) => {
      const card = loadedCheerio(el);
      const link = card.find('h2 a');
      const novelUrl = link.attr('href');
      if (!novelUrl) return;

      const img = card.find('.cs-browse-card__cover img');
      const src = img.attr('data-src') || img.attr('src');

      novels.push({
        name: (link.attr('title') || link.text()).trim(),
        cover: src && !src.startsWith('data:') ? src : defaultCover,
        path: this.toPath(novelUrl),
      });
    });

    return novels;
  }

  async browse(
    page: number,
    params: URLSearchParams,
  ): Promise<Plugin.NovelItem[]> {
    params.append('cs_page', page.toString());
    const loadedCheerio = await this.fetchPage(
      `${this.site}/novels/?${params.toString()}`,
    );
    return this.parseNovels(loadedCheerio);
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      sort: showLatestNovels ? 'latest-updated' : filters.sort.value,
    });
    if (filters.status.value) params.append('status', filters.status.value);
    filters.genres.value.forEach(g => params.append('genres[]', g));

    return this.browse(page, params);
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.browse(page, new URLSearchParams({ s: searchTerm }));
  }

  async fetchChapters(novelId: string, tier: string): Promise<ChapterItem[]> {
    const chapters: ChapterItem[] = [];
    let page = 1;
    let pages = 1;

    do {
      const params = new URLSearchParams({
        novel_id: novelId,
        tier,
        page: page.toString(),
        per_page: '100',
        order: 'ASC',
      });
      const data: ChapterJSON = await fetchApi(
        `${this.site}/wp-json/crimsonscrolls/v2/novel-chapters?${params.toString()}`,
      ).then(r => r.json());

      chapters.push(...(data.items || []));
      pages = Number(data.pages) || 1;
      page++;
    } while (page <= pages);

    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const loadedCheerio = await this.fetchPage(`${this.site}/${novelPath}`);
    const novelInfo = loadedCheerio('.cs-novel-info');

    const cover = loadedCheerio('.cs-cover img');
    const coverSrc = cover.attr('data-src') || cover.attr('src');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: novelInfo.find('h1').text().trim() || 'Untitled',
      cover:
        coverSrc && !coverSrc.startsWith('data:') ? coverSrc : defaultCover,
      summary: loadedCheerio('.cs-synopsis-content p')
        .map((_, el) => loadedCheerio(el).text().trim())
        .toArray()
        .filter(text => text)
        .join('\n\n'),
      author: loadedCheerio('.cs-novel-creator-card--author strong')
        .first()
        .text()
        .trim(),
      genres: loadedCheerio('.cs-detail-genres a')
        .map((_, el) => loadedCheerio(el).text().trim())
        .toArray()
        .join(','),
      chapters: [],
    };

    const rawStatus = loadedCheerio('.cs-cover-status')
      .first()
      .text()
      .trim()
      .toLowerCase();
    const statusMap: Record<string, string> = {
      'ongoing': NovelStatus.Ongoing,
      'completed': NovelStatus.Completed,
      'on hiatus': NovelStatus.OnHiatus,
      'hiatus': NovelStatus.OnHiatus,
      'dropped': NovelStatus.Cancelled,
      'cancelled': NovelStatus.Cancelled,
    };
    novel.status = statusMap[rawStatus] ?? NovelStatus.Unknown;

    const chapterPanel = loadedCheerio('[data-novel-chapters]');
    const novelId =
      chapterPanel.attr('data-novel-chapters') ||
      loadedCheerio('main.cs-novel-page').attr('data-view-id');
    if (!novelId) return novel;

    const tiers = loadedCheerio('[data-chapter-access-tier]')
      .map((_, el) => loadedCheerio(el).attr('data-chapter-access-tier'))
      .toArray()
      .filter(tier => tier);
    if (!tiers.length)
      tiers.push(chapterPanel.attr('data-default-tier') || 'free');

    const chapters: Plugin.ChapterItem[] = [];
    for (const tier of tiers) {
      const locked = tier !== 'free';
      if (locked && this.hideLocked) continue;

      const items = await this.fetchChapters(novelId, tier);
      items.forEach(item => {
        const title = item.title?.trim();
        const name = `Chapter ${item.number}${title ? `: ${title}` : ''}`;
        chapters.push({
          name: locked ? `🔒 ${name}` : name,
          path: this.toPath(item.url),
          releaseTime: item.date || null,
          chapterNumber: chapters.length + 1,
        });
      });
    }
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const loadedCheerio = await this.fetchPage(
      this.resolveUrl(chapterPath, false),
    );
    const content = loadedCheerio('article.cs-reader');

    if (content.find('.cs-tier-gate').length) {
      throw new Error(
        'This chapter is locked. Unlock it on Crimson Scrolls to read it.',
      );
    }

    content
      .find(
        [
          'header.cs-reader-title',
          '.cs-chapter-ad',
          '.cs-copy-watermark',
          'ins',
          'script',
          'style',
          'noscript',
          'iframe',
        ].join(','),
      )
      .remove();

    content.find('*').each((_, el) => {
      if (!('attribs' in el)) return;
      for (const attr of Object.keys(el.attribs)) {
        const value = el.attribs[attr].trim().toLowerCase();
        if (attr.startsWith('on') || value.startsWith('javascript:'))
          loadedCheerio(el).removeAttr(attr);
      }
    });

    return content.html() || '';
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('//')) return `https:${path}`;
    // Chapters saved by versions before 1.1.0 store only the chapter slug;
    // the site redirects /chapter/<slug>/ to the chapter's current URL.
    return !isNovel && !path.includes('/')
      ? `${this.site}/chapter/${path}/`
      : `${this.site}/${path}`;
  };

  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort by',
      value: 'latest-updated',
      options: [
        { label: 'Latest Updated', value: 'latest-updated' },
        { label: 'Newest Added', value: 'newest' },
        { label: 'Highest Rated', value: 'top-rated' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'Any status', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'On Hiatus', value: 'on-hiatus' },
        { label: 'Dropped', value: 'dropped' },
      ],
    },
    genres: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genres',
      value: [],
      options: [
        { label: 'Abyssal Villain', value: 'abyssal-villain' },
        { label: 'Anti-Hero', value: 'anti-hero' },
        { label: 'Anti-Hero Villain', value: 'anti-hero-villain' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Cultivation', value: 'cultivation' },
        { label: 'Dark Villain', value: 'dark-villain' },
        { label: 'Emotional Story', value: 'emotional-story' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Harem', value: 'harem' },
        { label: 'Horror', value: 'horror' },
        { label: 'Mature', value: 'mature' },
        { label: 'Misunderstanding', value: 'misunderstanding' },
        { label: 'Romance', value: 'romance' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Urban', value: 'urban' },
        { label: 'Urban Fantasy', value: 'urban-fantasy' },
        { label: 'Yandere', value: 'yandere' },
      ],
    },
  } satisfies Filters;
}

export default new CrimsonScrollsPlugin();
