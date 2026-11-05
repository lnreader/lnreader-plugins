import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

/**
 * Empire Novel (empirenovel.com) LNReader plugin
 *
 * A custom Laravel site behind a Cloudflare managed challenge:
 *
 * - Catalog:      `/novels-list?category=&status=&page=N` — 30
 *                 `.novellist_item` cards per page, sorted by name (the
 *                 site offers no popularity ranking and ignores sort
 *                 parameters on GET).
 * - Latest:       `/?page=N` — "Latest Releases" `.col_home` blocks.
 * - Search:       `/search-live?q=<term>` — JSON array of every matching
 *                 novel, unpaginated.
 * - Novel page:   `/novel/<slug>` — metadata plus the newest 30 chapters;
 *                 the rest are split across `?page=N`.
 * - Chapter list: `/select-partial/<slug>/<chapter>` — the reader's
 *                 chapter `<select>`, listing every chapter newest first
 *                 in a single request (the chapter must exist).
 * - Chapter page: `/novel/<slug>/<chapter>` — text inside `#read-novel`.
 */
class EmpireNovel implements Plugin.PluginBase {
  id = 'empirenovel';
  name = 'Empire Novel';
  version = '1.0.0';
  icon = 'src/en/empirenovel/icon.png';
  site = 'https://www.empirenovel.com/';

  // Throw (carrying the HTTP status) on a refused response so a
  // Cloudflare challenge is reported instead of being parsed into a
  // false empty result. The whole site sits behind a managed challenge,
  // which answers 403/503 until it is solved in WebView.
  private async fetchSite(url: string) {
    const res = await fetchApi(url);
    if (!res.ok) {
      const message =
        res.status === 403 || res.status === 503
          ? 'Cloudflare protection detected (HTTP error). Please try opening the plugin in WebView first to solve the challenge.'
          : 'Request failed: ' + res.status;
      throw Object.assign(new Error(message), { status: res.status });
    }
    return res;
  }

  private coverUrl(src: string | undefined) {
    const path = src?.trim();
    return path ? new URL(path, this.site).href : defaultCover;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    if (showLatestNovels) {
      const $ = parseHTML(
        await this.fetchSite(`${this.site}?page=${pageNo}`).then(r => r.text()),
      );
      $('.home_release .col_home').each((_, el) => {
        const link = $(el).find('h4 a');
        const href = link.attr('href');
        const name = link.text().trim();
        if (!href || !name) return;
        novels.push({
          name,
          path: href.replace(/^\//, ''),
          cover: this.coverUrl($(el).find('img').attr('data-src')),
        });
      });
      return novels;
    }

    const params = new URLSearchParams();
    if (filters?.category.value) {
      params.append('category', filters.category.value);
    }
    if (filters?.status.value) params.append('status', filters.status.value);
    params.append('page', pageNo.toString());

    const $ = parseHTML(
      await this.fetchSite(`${this.site}novels-list?${params.toString()}`).then(
        r => r.text(),
      ),
    );
    $('.novellist_item').each((_, el) => {
      const link = $(el).find('a:has(h2)');
      const href = link.attr('href');
      const name = link.find('h2').text().trim();
      if (!href || !name) return;
      novels.push({
        name,
        path: href.replace(/^\//, ''),
        cover: this.coverUrl($(el).find('img').attr('data-src')),
      });
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = parseHTML(
      await this.fetchSite(this.site + novelPath).then(r => r.text()),
    );

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1[itemprop]').first().text().trim() || 'Untitled',
      cover: this.coverUrl($('img.show_image').attr('data-src')),
      author: $('[itemprop="author"]').text().trim() || undefined,
      genres: $('[itemprop="genre"]')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
    };

    // The summary is cut at a fixed length into a visible part, a "..."
    // span and a hidden remainder, with a space inserted before the "..."
    // span; rejoin the halves where the site split them.
    const summary = $('[itemprop="description"]');
    summary.find('#read_more').remove();
    novel.summary = parseHTML(
      (summary.html() ?? '').replace(
        / ?<span id="dots">[\s\S]*?<\/span><span id="more">/,
        '',
      ),
    )
      .text()
      .trim();

    const status = $('.show_details > div')
      .filter((_, el) => $(el).text().trim().startsWith('Status'))
      .find('span')
      .text()
      .trim();
    if (status === 'Ongoing') novel.status = NovelStatus.Ongoing;
    else if (status === 'Completed') novel.status = NovelStatus.Completed;
    else if (status === 'Abandoned') novel.status = NovelStatus.Cancelled;
    else novel.status = NovelStatus.Unknown;

    // The novel page only lists 30 chapters per page, so read the full
    // list from the reader's chapter selector, which needs any existing
    // chapter of the novel in its URL.
    const chapterHref = $('a.chapter_link').first().attr('href');
    const chapterSlug = chapterHref?.split('/').pop();
    const novelSlug = novelPath.split('/').pop();
    const chapters: Plugin.ChapterItem[] = [];
    if (chapterSlug && novelSlug) {
      const $list = parseHTML(
        await this.fetchSite(
          `${this.site}select-partial/${novelSlug}/${chapterSlug}`,
        ).then(r => r.text()),
      );
      $list('option').each((_, el) => {
        const href = $list(el).attr('value');
        const name = $list(el).text().trim();
        if (!href || !name) return;
        const chapterNumber = Number(href.split('/').pop());
        chapters.push({
          name,
          path: href.replace(/^\//, ''),
          chapterNumber: Number.isFinite(chapterNumber)
            ? chapterNumber
            : undefined,
        });
      });
    }
    // The selector lists the newest chapter first.
    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = parseHTML(
      await this.fetchSite(this.site + chapterPath).then(r => r.text()),
    );
    const content = $('#read-novel');
    if (content.length === 0) {
      throw new Error('Chapter content not found');
    }

    // The reader renders this HTML unsanitized, so drop anything that could
    // run code: active elements, event handlers and javascript: URLs.
    content
      .find('script, style, iframe, object, embed, form, noscript, ins')
      .remove();
    content.find('*').each((_, el) => {
      if (el.type !== 'tag') return;
      for (const [attr, value] of Object.entries(el.attribs)) {
        if (
          /^on/i.test(attr) ||
          /javascript:/i.test(value.replace(/\s+/g, ''))
        ) {
          $(el).removeAttr(attr);
        }
      }
    });
    return content.html() ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // search-live returns every match at once.
    if (pageNo > 1) return [];

    const results: { name: string; slug: string; cover: number }[] =
      await this.fetchSite(
        `${this.site}search-live?q=${encodeURIComponent(searchTerm)}`,
      ).then(r => r.json());

    return results.map(novel => ({
      name: novel.name,
      path: `novel/${novel.slug}`,
      cover: novel.cover
        ? `${this.site}uploads/novel/${novel.slug}/cover/cover_thumb.jpg`
        : defaultCover,
    }));
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    category: {
      label: 'Category',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adult', value: 'adult' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Animals', value: 'animals' },
        { label: 'Arts', value: 'arts' },
        { label: 'Bender', value: 'bender' },
        { label: 'Biographies', value: 'biographies' },
        { label: 'Business', value: 'business' },
        { label: 'Chinese', value: 'chinese' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Eastern', value: 'eastern' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Education', value: 'education' },
        { label: 'Entertainment', value: 'entertainment' },
        { label: 'Fanfiction', value: 'fanfiction' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Fiction', value: 'fiction' },
        { label: 'Game', value: 'game' },
        { label: 'Gender', value: 'gender' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'H', value: 'h' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'History', value: 'history' },
        { label: 'Home', value: 'home' },
        { label: 'Horror', value: 'horror' },
        { label: 'Humor', value: 'humor' },
        { label: 'Isekai', value: 'isekai' },
        { label: 'Josei', value: 'josei' },
        { label: 'Korean', value: 'korean' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mecha', value: 'mecha' },
        { label: 'Memoirs', value: 'memoirs' },
        { label: 'Modern Life', value: 'modern-life' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Original', value: 'original' },
        { label: 'Other Books', value: 'other-books' },
        { label: 'Philosophy', value: 'philosophy' },
        { label: 'Photography', value: 'photography' },
        { label: 'Politics', value: 'politics' },
        { label: 'Professional', value: 'professional' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Reincarnation', value: 'reincarnation' },
        { label: 'Religion', value: 'religion' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'School Stories', value: 'school-stories' },
        { label: 'Sci-Fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Short Stories', value: 'short-stories' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Shoujo Ai', value: 'shoujo-ai' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Shounen Ai', value: 'shounen-ai' },
        { label: 'Slice Of Life', value: 'slice-of-life' },
        { label: 'Smut', value: 'smut' },
        { label: 'Social Science', value: 'social-science' },
        { label: 'Spirituality', value: 'spirituality' },
        { label: 'Sports', value: 'sports' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'System', value: 'system' },
        { label: 'Technical', value: 'technical' },
        { label: 'Technology', value: 'technology' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Transmigration', value: 'transmigration' },
        { label: 'Urban', value: 'urban' },
        { label: 'Virtual Reality', value: 'virtual-reality' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Xuanhuan', value: 'xuanhuan' },
        { label: 'Yaoi', value: 'yaoi' },
        { label: 'Yuri', value: 'yuri' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: '1' },
        { label: 'Completed', value: '2' },
        { label: 'Abandoned', value: '3' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new EmpireNovel();
