import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class AsianFanfics implements Plugin.PluginBase {
  id = 'asianfanfics';
  name = 'Asianfanfics';
  version = '1.0.0';
  icon = 'src/en/asianfanfics/icon.png';
  site = 'https://www.asianfanfics.com/';

  // Listings, story details and chapter text are HTMX fragments that the
  // pages load after render; fetch those fragments directly.
  async fetchHtml(url: string, referer?: string): Promise<CheerioAPI> {
    const res = await fetchApi(url, {
      headers: referer ? { Referer: referer } : undefined,
    });
    if (!res.ok) {
      // Keep the status and response on the error so an anti-bot block is
      // reported as such rather than as a parsing failure.
      throw Object.assign(new Error(`Could not reach ${url} (${res.status})`), {
        status: res.status,
        response: res,
      });
    }
    return parseHTML(await res.text());
  }

  parseNovels($: CheerioAPI): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    $('article').each((_, ele) => {
      const link = $(ele).find('h3 a[href*="/story/view/"]').first();
      const href = link.attr('href');
      if (!href) return;

      novels.push({
        name: link.text().trim(),
        path: href.replace(/^\//, ''),
        cover: $(ele).find('img').first().attr('src') || defaultCover,
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
    const sort = showLatestNovels ? 'latest' : filters.sort.value;
    const params = new URLSearchParams({ page: page.toString() });
    if (filters.language.value) {
      params.set('language', filters.language.value);
    }

    const $ = await this.fetchHtml(
      `${this.site}htmx/browse/en/${sort}?${params.toString()}`,
    );
    return this.parseNovels($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const $ = await this.fetchHtml(url);
    const header = $('main header').first();

    header.find('h1 span').remove();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: header.find('h1').text().trim() || 'Untitled',
      cover: header.find('img').first().attr('src') || defaultCover,
      author: header.find('a[href^="/profile/"]').first().text().trim(),
      genres: header
        .find('a[href^="/browse/tag/"]')
        .map((_, ele) => $(ele).text().trim())
        .get()
        .join(', '),
      status: header
        .find('span')
        .toArray()
        .some(ele => $(ele).text().trim().toLowerCase() === 'completed')
        ? NovelStatus.Completed
        : NovelStatus.Ongoing,
    };

    const descriptionPath = $('#bodyText [hx-get^="/htmx/story/"]').attr(
      'hx-get',
    );
    if (descriptionPath) {
      const description = await this.fetchHtml(
        this.site + descriptionPath.replace(/^\//, ''),
        url,
      );
      novel.summary = description('#story-description').text().trim();
    }

    // The table of contents is rendered twice (sidebar and mobile sheet), and
    // its entry 0 is the foreword, i.e. the story page itself.
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    $('a[data-toc-chapter]:not([data-toc-chapter="0"])').each((_, ele) => {
      const href = $(ele).attr('href');
      if (!href || seen.has(href)) return;
      seen.add(href);

      chapters.push({
        name: $(ele).find('span.truncate').text().trim(),
        path: href.replace(/^\//, ''),
        chapterNumber:
          parseInt($(ele).find('span').first().text().trim(), 10) ||
          chapters.length + 1,
      });
    });
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const $ = await this.fetchHtml(url);
    const body = $('#bodyText');

    const contentPath = body
      .find('[hx-get^="/htmx/chapter/"]')
      .first()
      .attr('hx-get');
    if (contentPath) {
      const chapter = await this.fetchHtml(
        this.site + contentPath.replace(/^\//, ''),
        url,
      );
      return this.cleanHtml(chapter);
    }

    // Members-only, subscribers-only and friends-only chapters show a notice
    // and, sometimes, a public teaser instead of the chapter text.
    const notice =
      body.find('div.border-dashed:not(#content-load-error)').first().text() ||
      'This chapter is not publicly available.';
    const message = parseHTML('<p><strong></strong></p>');
    message('strong').text(
      `${notice.trim()} This chapter requires an Asianfanfics account and cannot be read in this plugin.`,
    );
    let html = message('body').html() || '';

    const teaserPath = body
      .find('[hx-get^="/htmx/teaser/"]')
      .first()
      .attr('hx-get');
    if (teaserPath) {
      const teaser = await this.fetchHtml(
        this.site + teaserPath.replace(/^\//, ''),
        url,
      );
      const teaserHtml = this.cleanHtml(teaser);
      if (teaserHtml.trim()) {
        html += `<p><em>Teaser:</em></p>${teaserHtml}`;
      }
    }
    return html;
  }

  // Returns the fragment's chapter body without scripts, stylesheets, inline
  // styles, event handlers or javascript: URLs. The body is author-written, so
  // inline styles could otherwise lay content over the reader.
  cleanHtml($: CheerioAPI): string {
    const content = $('#user-submitted-body');
    content
      .find('script, style, link, meta, iframe, object, embed, form')
      .remove();
    content.find('[style]').removeAttr('style');
    content.find('*').each((_, ele) => {
      if (ele.type !== 'tag') return;
      for (const name of Object.keys(ele.attribs)) {
        const value = ele.attribs[name].trim().toLowerCase();
        if (
          name.toLowerCase().startsWith('on') ||
          value.startsWith('javascript:')
        ) {
          $(ele).removeAttr(name);
        }
      }
    });
    return content.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      q: searchTerm,
      page: page.toString(),
    });
    const $ = await this.fetchHtml(
      `${this.site}htmx/browse/search?${params.toString()}`,
      `${this.site}browse/search?${params.toString()}`,
    );
    return this.parseNovels($);
  }

  resolveUrl = (path: string) => this.site + path;

  filters = {
    sort: {
      label: 'Sort',
      value: 'trending',
      options: [
        { label: 'Trending', value: 'trending' },
        { label: 'Latest', value: 'latest' },
        { label: 'Newest', value: 'newest' },
        { label: 'Completed', value: 'completed' },
        { label: 'One Shots', value: 'one-shots' },
        { label: 'Featured', value: 'featured' },
        { label: 'Views', value: 'views' },
        { label: 'Subscriptions', value: 'favorited' },
        { label: 'Commented', value: 'commented' },
      ],
      type: FilterTypes.Picker,
    },
    language: {
      label: 'Language',
      value: '',
      options: [
        { label: 'All languages', value: '' },
        { label: 'Arabic', value: 'ar' },
        { label: 'Chinese', value: 'zh' },
        { label: 'English', value: 'en' },
        { label: 'French', value: 'fr' },
        { label: 'German', value: 'de' },
        { label: 'Indonesian', value: 'id' },
        { label: 'Japanese', value: 'ja' },
        { label: 'Korean', value: 'ko' },
        { label: 'Malay', value: 'ms' },
        { label: 'Portuguese', value: 'pt' },
        { label: 'Russian', value: 'ru' },
        { label: 'Spanish', value: 'es' },
        { label: 'Tagalog / Filipino', value: 'tl' },
        { label: 'Thai', value: 'th' },
        { label: 'Vietnamese', value: 'vi' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new AsianFanfics();
