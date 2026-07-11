import { CheerioAPI, load as parseHTML } from 'cheerio';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';

class FuckNovelpia implements Plugin.PluginBase {
  id = 'FuckNovelpia';
  name = 'FuckNovelpia';
  icon = 'src/en/fucknovelpia/icon.png';
  site = 'https://fucknovelpia.com/';
  version = '1.0.0';

  // Returns false once the site has silently clamped us past the real last page.
  hasRequestedPage(cheerio: CheerioAPI, requestedPage: number): boolean {
    if (requestedPage <= 1) return true;
    const activeText = cheerio('div.pagination a.active').first().text().trim();
    const activePage = parseInt(activeText, 10);
    // No pagination at all, or active page doesn't match what we asked for
    // -> the site redirected us (usually back to page 1). Stop here.
    return !isNaN(activePage) && activePage === requestedPage;
  }

  parseNovelsList(cheerio: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    cheerio('div.grid a[href*="/novel/"]').each((i, el) => {
      const $el = cheerio(el);

      const href = $el.attr('href');
      if (!href) return;

      const path = href.replace(this.site, '').replace(/^\/+/, '');
      if (!path.startsWith('novel/') || seen.has(path)) return;

      const card = $el.closest('div, li, article');
      const img =
        $el.find('img').attr('src') ||
        card.find('img').first().attr('src') ||
        undefined;

      const title =
        card.find('h3, h2, .title, strong').first().text().trim() ||
        $el.attr('title')?.trim() ||
        $el.text().trim().split('\n')[0].trim();

      if (!title) return;

      seen.add(path);
      novels.push({
        name: title,
        path,
        cover: img || defaultCover,
      });
    });

    return novels;
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link;
    if (showLatestNovels) {
      link = this.site + 'search.php?q=&sort=latest';
    } else {
      link = this.site + 'search.php' + '?q=&sort=popular';
      link += `&sort=${encodeURIComponent(filters?.sort?.value ?? 'newest')}`;
    }

    if (page > 1) {
      link += '&page=' + page;
    }

    const genreIncludeParams = (filters?.genres?.value?.include ?? [])
      .map(value => `&genres_include%5B%5D=${value}`)
      .join('');
    const genreExcludeParams = (filters?.genres?.value?.exclude ?? [])
      .map(value => `&genres_exclude%5B%5D=${value}`)
      .join('');
    link +=
      '&genre_mode=' +
      filters.genres_include_operator.value +
      genreIncludeParams +
      genreExcludeParams;

    const tagIncludeParams = (filters?.tags_include?.value ?? '')
      .split(/[,\s]+/)
      .map(tag => tag.trim())
      .filter(Boolean)
      .map(tag => `&tags_include%5B%5D=${encodeURIComponent(tag)}`)
      .join('');
    const tagExcludeParams = (filters?.tags_exclude?.value ?? '')
      .split(/[,\s]+/)
      .map(tag => tag.trim())
      .filter(Boolean)
      .map(tag => `&tags_exclude%5B%5D=${encodeURIComponent(tag)}`)
      .join('');
    link +=
      '&tag_mode=' +
      filters.tags_include_operator.value +
      tagIncludeParams +
      tagExcludeParams;

    const result = await fetchApi(link);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    if (!this.hasRequestedPage(loadedCheerio, page)) return [];
    return this.parseNovelsList(loadedCheerio);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await fetchApi(this.site + novelPath);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);

    const infoMap: Record<string, string> = {};
    loadedCheerio('li, dd, p').each((i, el) => {
      const text = loadedCheerio(el).text().trim();
      const match = text.match(/^([A-Za-z][A-Za-z ]{2,20}):\s*(.+)$/);
      if (match && !infoMap[match[1].trim()]) {
        infoMap[match[1].trim()] = match[2].trim();
      }
    });

    const ogTitle =
      loadedCheerio('meta[property="og:title"]').attr('content') || '';
    const name =
      loadedCheerio('h1').first().text().trim() || ogTitle.split('·')[0].trim();

    const cover =
      loadedCheerio('meta[property="og:image"]').attr('content') ||
      defaultCover;

    const summary =
      loadedCheerio('meta[property="og:description"]').attr('content') || '';

    const genres = loadedCheerio(
      'a[href*="tags%5B"], a[href*="tags["], a[href*="genres%5B"], a[href*="genres["]',
    )
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .filter(Boolean)
      .join(', ');

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: name || 'Untitled',
      cover,
      summary,
      author: infoMap['Author'] || '',
      genres,
      chapters: [],
    };

    const rawStatus = infoMap['Status'] || '';
    if (/ongoing/i.test(rawStatus)) {
      novel.status = 'Ongoing';
    } else if (/completed/i.test(rawStatus)) {
      novel.status = 'Completed';
    } else if (rawStatus) {
      novel.status = rawStatus;
    }

    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio(
      'a[href*="chapter.php?hash="], a[href*="chapter.php?ch="]',
    ).each((i, el) => {
      const $el = loadedCheerio(el);
      const path = ($el.attr('href') || '')
        .trim()
        .replace(this.site, '')
        .replace(/^\/+/, '');
      const name = $el.text().trim();
      if (!path || !name) return;
      chapters.push({ name, path });
    });

    // Chapters on the novel page are already listed oldest -> newest.
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetchApi(this.site + chapterPath);
    const body = await result.text();
    const $ = parseHTML(body);

    const chapter = $('.reader').first();

    if (!chapter.length) {
      return '';
    }

    // Remove things that aren't part of the chapter
    chapter.find('.reader-nav').remove();
    chapter.find('script').remove();
    chapter.find('style').remove();

    return chapter.html()?.replace(/&nbsp;/g, ' ') ?? '';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + '?q=' + encodeURIComponent(searchTerm);

    if (page > 1) {
      link += '&page=' + page;
    }

    const result = await fetchApi(link);
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    if (!this.hasRequestedPage(loadedCheerio, page)) return [];
    return this.parseNovelsList(loadedCheerio);
  }

  filters = {
    sort: {
      label: 'Sort',
      value: 'newest',
      options: [
        { label: 'Newest', value: 'newest' },
        { label: 'Popular', value: 'popular' },
        { label: 'Oldest', value: 'oldest' },
        { label: 'Title A-Z', value: 'title' },
        { label: 'Year (Descending)', value: 'year_desc' },
        { label: 'Year (Ascending)', value: 'year_asc' },
      ],
      type: FilterTypes.Picker,
    },
    genres_include_operator: {
      label: 'Include Genres',
      value: 'and',
      options: [
        { label: 'AND', value: 'and' },
        { label: 'OR', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Academy', value: '1' },
        { label: 'Action', value: '2' },
        { label: 'Adventure', value: '3' },
        { label: 'Fantasy', value: '4' },
        { label: 'Horror', value: '5' },
        { label: 'Mystery', value: '6' },
        { label: 'Romance', value: '7' },
        { label: 'School', value: '8' },
        { label: 'Martial', value: '9' },
        { label: 'Smut', value: '10' },
        { label: 'Adult', value: '11' },
        { label: 'Harem', value: '12' },
        { label: 'Historical', value: '13' },
        { label: 'Sci-Fi', value: '14' },
        { label: 'Slice of Life', value: '15' },
        { label: 'Sports', value: '16' },
        { label: 'Uncategorized', value: '17' },
      ],
      type: FilterTypes.ExcludableCheckboxGroup,
    },
    tags_include_operator: {
      label: 'Include Tags',
      value: 'and',
      options: [
        { label: 'AND', value: 'and' },
        { label: 'OR', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
    tags_include: {
      label: 'Tags Include',
      value: '',
      type: FilterTypes.TextInput,
    },
    tags_exclude: {
      label: 'Tags Exclude',
      value: '',
      type: FilterTypes.TextInput,
    },
  } satisfies Filters;
}

export default new FuckNovelpia();
