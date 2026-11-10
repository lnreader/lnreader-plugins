import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const SITE = 'https://turkcenoveloku.blogspot.com/';
const SERIES_LABEL = 'Seri';
const CHAPTER_LABEL = 'Bölüm';
const ONGOING_LABEL = 'Devam Ediyor';
const COMPLETED_LABEL = 'Tamamlandı';
const PAGE_SIZE = 150;
const MAX_FEED_PAGES = 40;

// Blogger labels that describe the post type or the release state rather than
// the story, so they are left out of the genre list.
const NON_GENRE_LABELS = [
  SERIES_LABEL,
  'Series',
  'Novel',
  ONGOING_LABEL,
  COMPLETED_LABEL,
];

type FeedEntry = {
  title: { $t: string };
  published: { $t: string };
  content?: { $t: string };
  category?: { term: string }[];
  link: { rel: string; href: string }[];
};

type Series = {
  name: string;
  path: string;
  cover: string;
  /** Blogger label shared by every chapter post of the series. */
  label: string;
  categories: string[];
  summary?: string;
  author?: string;
  artist?: string;
};

const normalize = (text: string) =>
  text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');

class TurkceNovelOkuPlugin implements Plugin.PluginBase {
  id = 'turkcenoveloku';
  name = 'Türkçe Novel Oku';
  icon = 'src/tr/turkcenoveloku/icon.png';
  site = SITE;
  version = '1.0.0';

  filters = {
    sort: {
      label: 'Sıralama',
      value: 'new',
      options: [
        { label: 'Yeni eklenen', value: 'new' },
        { label: 'Eski eklenen', value: 'old' },
        { label: 'A-Z', value: 'name' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Durum',
      value: 'all',
      options: [
        { label: 'Tümü', value: 'all' },
        { label: ONGOING_LABEL, value: ONGOING_LABEL },
        { label: COMPLETED_LABEL, value: COMPLETED_LABEL },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Tür',
      value: 'all',
      options: [
        { label: 'Tümü', value: 'all' },
        ...[
          'Aksiyon',
          'Bilim Kurgu',
          'Doğaüstü',
          'Dram',
          'Dövüş Sanatları',
          'Fantastik',
          'Gizem',
          'Harem',
          'Komedi',
          'Korku',
          'Macera',
          'Mecha',
          'Psikolojik',
          'Seinen',
          'Shounen',
          'Spor',
          'Trajedi',
          'Xuanhuan',
          'Yetişkin',
          'Çin Serisi',
          'Kore Serisi',
        ].map(genre => ({ label: genre, value: genre })),
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  private seriesCache?: Promise<Series[]>;

  /** "https://host/2025/03/post.html" -> "2025/03/post.html" */
  private toPath(href: string): string {
    return href.replace(/^https?:\/\/[^/]+\//, '').split(/[?#]/)[0];
  }

  private postPath(entry: FeedEntry): string | undefined {
    const link = entry.link.find(item => item.rel === 'alternate');
    return link ? this.toPath(link.href) : undefined;
  }

  /**
   * Reads every entry of a Blogger label feed. A page can come back with fewer
   * entries than requested, so the next page starts after the entries that
   * were actually returned; skipping a full page size would drop chapters.
   */
  private async readFeed(labels: string[]): Promise<FeedEntry[]> {
    const entries: FeedEntry[] = [];
    const seen = new Set<string>();
    const labelPath = labels.map(label => encodeURIComponent(label)).join('/');
    let startIndex = 1;
    for (let page = 0; page < MAX_FEED_PAGES; page++) {
      const url =
        `${SITE}feeds/posts/default/-/${labelPath}?alt=json` +
        `&orderby=published&max-results=${PAGE_SIZE}&start-index=${startIndex}`;
      const response = await fetchApi(url);
      if (!response.ok) {
        throw new Error(`Türkçe Novel Oku: HTTP ${response.status}.`);
      }
      const data = await response.json();
      const batch: FeedEntry[] = (data.feed && data.feed.entry) || [];
      if (!batch.length) break;
      for (const entry of batch) {
        const path = this.postPath(entry);
        if (path && !seen.has(path)) {
          seen.add(path);
          entries.push(entry);
        }
      }
      startIndex += batch.length;
    }
    return entries;
  }

  private parseSeries(entry: FeedEntry): Series | undefined {
    const path = this.postPath(entry);
    if (!path) return undefined;
    const $ = parseHTML(`<div>${entry.content ? entry.content.$t : ''}</div>`);
    const name = entry.title.$t.trim();
    const label = $('.chapter_get').attr('data-labelchapter') || name;
    const cover = $('img').first().attr('src');

    $('#syn_bod br').replaceWith('\n');
    // Line breaks sit between <br> tags in the source; keep one blank line.
    const summary = $('#syn_bod')
      .text()
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const author = $('#tauther').text().trim();
    const artist = $('#tartist').text().trim();

    return {
      name,
      path,
      label,
      cover: cover || defaultCover,
      categories: (entry.category || []).map(category => category.term),
      summary: summary || undefined,
      author: author || undefined,
      artist: artist && artist !== 'N/A' ? artist : undefined,
    };
  }

  /** Every series of the site (the "Seri" label), newest first. */
  private getSeries(): Promise<Series[]> {
    if (!this.seriesCache) {
      this.seriesCache = this.readFeed([SERIES_LABEL])
        .then(entries =>
          entries
            .map(entry => this.parseSeries(entry))
            .filter((series): series is Series => !!series),
        )
        .catch(error => {
          this.seriesCache = undefined;
          throw error;
        });
    }
    return this.seriesCache;
  }

  private toItem(series: Series): Plugin.NovelItem {
    return { name: series.name, path: series.path, cover: series.cover };
  }

  /** Series ordered by the publish time of their newest chapter. */
  private async latestSeries(all: Series[]): Promise<Series[]> {
    const response = await fetchApi(
      `${SITE}feeds/posts/default/-/${encodeURIComponent(CHAPTER_LABEL)}` +
        `?alt=json&orderby=published&max-results=${PAGE_SIZE}`,
    );
    if (!response.ok) {
      throw new Error(`Türkçe Novel Oku: HTTP ${response.status}.`);
    }
    const data = await response.json();
    const recent: FeedEntry[] = (data.feed && data.feed.entry) || [];
    const ordered: Series[] = [];
    for (const entry of recent) {
      const terms = (entry.category || []).map(category => category.term);
      const series = all.find(item => terms.includes(item.label));
      if (series && !ordered.includes(series)) ordered.push(series);
    }
    return ordered.concat(all.filter(series => !ordered.includes(series)));
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The site only has a handful of series, so one page holds all of them.
    if (pageNo > 1) return [];
    const all = await this.getSeries();
    let list = all.slice();

    if (showLatestNovels) {
      list = await this.latestSeries(all);
    } else if (filters.sort.value === 'old') {
      list.reverse();
    } else if (filters.sort.value === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    if (filters.status.value !== 'all') {
      list = list.filter(series =>
        series.categories.includes(filters.status.value),
      );
    }
    if (filters.genre.value !== 'all') {
      list = list.filter(series =>
        series.categories.includes(filters.genre.value),
      );
    }
    return list.map(series => this.toItem(series));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const all = await this.getSeries();
    const series = all.find(item => item.path === novelPath);
    if (!series) throw new Error('Seri bulunamadı: ' + novelPath);

    const status = series.categories.includes(COMPLETED_LABEL)
      ? NovelStatus.Completed
      : series.categories.includes(ONGOING_LABEL)
        ? NovelStatus.Ongoing
        : NovelStatus.Unknown;

    const genres = series.categories.filter(
      term => term !== series.label && !NON_GENRE_LABELS.includes(term),
    );

    const posts = await this.readFeed([CHAPTER_LABEL, series.label]);
    // The feed lists the newest post first; readers want oldest first.
    posts.reverse();
    const chapters: Plugin.ChapterItem[] = posts.map(post => {
      const title = post.title.$t.trim();
      // "TKA Bölüm 12 - Name" -> "Bölüm 12 - Name": drop the series acronym.
      const name = title.replace(/^[A-Za-z0-9]{2,6}\s+(?=Bölüm)/, '');
      const number = /Bölüm\s*(\d+(?:\.\d+)?)/.exec(title);
      return {
        name,
        path: this.postPath(post) as string,
        releaseTime: post.published.$t,
        chapterNumber: number ? Number(number[1]) : undefined,
      };
    });

    return {
      path: series.path,
      name: series.name,
      cover: series.cover,
      summary: series.summary,
      author: series.author,
      artist: series.artist,
      status,
      genres: genres.join(','),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchApi(SITE + chapterPath);
    if (!response.ok) {
      throw new Error(`Türkçe Novel Oku: HTTP ${response.status}.`);
    }
    const $ = parseHTML(await response.text());
    const content = $('#ceviri').first();
    if (!content.length) {
      throw new Error(
        'Bölüm metni bulunamadı, web görünümünde açmayı deneyin.',
      );
    }
    content.find('script, style, noscript, iframe, ins').remove();
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // The site's own search also matches every chapter post, so the series
    // list (a handful of titles) is filtered by name instead.
    if (pageNo > 1) return [];
    const term = normalize(searchTerm);
    const all = await this.getSeries();
    return all
      .filter(series => normalize(series.name).includes(term))
      .map(series => this.toItem(series));
  }
}

export default new TurkceNovelOkuPlugin();
