import { CheerioAPI, load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters } from '@libs/filterInputs';

type FictioneerSelectors = {
  browseCard: string;
  searchCard: string;
  cardTitle: string;
  cardCover: string;
  novelTitle: string;
  novelAuthor: string;
  novelCover: string;
  novelSummary: string;
};

const defaultSelectors: FictioneerSelectors = {
  browseCard:
    '#featured-list > li > div > div, #list-of-stories > li > div > div',
  searchCard: '#search-result-list > li > div > div',
  cardTitle: 'h3 > a',
  cardCover: 'a.cell-img:has(img)',
  novelTitle: 'h1.story__identity-title, h1.story__title',
  novelAuthor: 'div.story__identity-meta',
  novelCover: 'figure.story__thumbnail > a',
  novelSummary: 'section.story__summary',
};

type FictioneerOptions = {
  browsePage: string;
  lang?: string;
  versionIncrements?: number;
  trimTrailingSlash?: boolean;
  selectors?: Partial<FictioneerSelectors>;
};

export type FictioneerMetadata = {
  id: string;
  sourceSite: string;
  sourceName: string;
  options: FictioneerOptions;
};

export class FictioneerPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options: FictioneerOptions;
  selectors: FictioneerSelectors;
  filters: Filters | undefined = undefined;

  constructor(metadata: FictioneerMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    this.icon = `multisrc/fictioneer/${metadata.id.toLowerCase()}/icon.png`;
    this.site = metadata.sourceSite;
    const versionIncrements = metadata.options?.versionIncrements || 0;
    this.version = `1.3.${0 + versionIncrements}`;
    this.options = metadata.options;
    this.selectors = { ...defaultSelectors, ...metadata.options?.selectors };
  }

  resolveUrl = (path: string): string => {
    const [pathname, query] = path.split('?');
    const cleanPath = pathname ? pathname.replace(/^\/+|\/+$/g, '') + '/' : '';
    return (
      this.site.replace(/\/+$/, '') +
      '/' +
      cleanPath +
      (query ? '?' + query : '')
    );
  };

  private toPath(url: string): string {
    let path = url;
    if (path.startsWith(this.site)) {
      path = path.slice(this.site.length);
    } else {
      try {
        path = new URL(url, this.site).pathname;
      } catch {
        // fallback
      }
    }
    path = path.replace(/^\/+|\/+$/g, '');
    return this.options.trimTrailingSlash ? path : path + '/';
  }

  private parseNovels(
    loadedCheerio: CheerioAPI,
    selector: string,
  ): Plugin.NovelItem[] {
    return loadedCheerio(selector)
      .map((i, el) => {
        const element = loadedCheerio(el);
        const title = element.find(this.selectors.cardTitle);
        const novelName = title.text().trim();
        const cover = element.find(this.selectors.cardCover);
        const novelCover =
          cover.attr('data-src') || cover.attr('src') || cover.attr('href');
        const novelUrl = title.attr('href');

        if (!novelUrl) return;

        return {
          name: novelName,
          cover: novelCover,
          path: this.toPath(novelUrl),
        };
      })
      .toArray();
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (showLatestNovels) {
      // Latest updates come from a search results page, so use searchCard.
      const req = await fetchApi(
        this.resolveUrl(
          `${pageNo === 1 ? '' : 'page/' + pageNo + '/'}?s=&post_type=fcn_story&orderby=modified&order=desc`,
        ),
      );
      const body = await req.text();
      const loadedCheerio = loadCheerio(body);

      return this.parseNovels(loadedCheerio, this.selectors.searchCard);
    }

    const req = await fetchApi(
      this.resolveUrl(
        `${this.options.browsePage}/${pageNo === 1 ? '' : 'page/' + pageNo + '/'}`,
      ),
    );
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return this.parseNovels(loadedCheerio, this.selectors.browseCard);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const req = await fetchApi(this.resolveUrl(novelPath));
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: this.toPath(novelPath),
      name: loadedCheerio(this.selectors.novelTitle).first().text().trim(),
    };

    let author = loadedCheerio(this.selectors.novelAuthor).text().trim();
    if (this.options.selectors?.novelAuthor) {
      novel.author = author;
    } else {
      author = author
        .split('|')[0]
        .replace(/author:\s*/i, '')
        .replace(/by\s+/i, '')
        .trim();
      if (!author) {
        // Fallback for custom Fictioneer child themes embedding author in summary metadata
        const authorStrong = loadedCheerio('strong, b').filter((_, el) =>
          loadedCheerio(el).text().trim().toLowerCase().startsWith('author'),
        );
        if (authorStrong.length) {
          const nextLink = authorStrong.first().next('a');
          if (nextLink.length) {
            author = nextLink.text().trim();
          } else {
            const parentText = authorStrong.first().parent().text();
            const match = parentText.match(/author:\s*([^\n\r<]+)/i);
            if (match) {
              author = match[1].replace(/total chapters.*$/i, '').trim();
            }
          }
        }
      }
      if (author) novel.author = author;
    }

    const cover = loadedCheerio(this.selectors.novelCover);
    novel.cover =
      cover.attr('data-src') || cover.attr('src') || cover.attr('href');
    novel.genres = loadedCheerio('div.tag-group > a, section.tag-group > a')
      .map((i, el) => loadedCheerio(el).text().trim())
      .toArray()
      .join(',');

    const summary = loadedCheerio(this.selectors.novelSummary);
    summary.find('.related-stories-block, section.small-card-block').remove();
    summary.find('p').after('\n\n');
    summary.find('br').after('\n');
    novel.summary = summary
      .text()
      .trim()
      .replace(/\n{3,}/g, '\n\n');

    novel.chapters = loadedCheerio('li.chapter-group__list-item._publish')
      .filter((i, el) => !el.attribs['class'].includes('_password'))
      .filter(
        (i, el) =>
          !(loadedCheerio(el).find('i').first().attr('class') || '').includes(
            'fa-lock',
          ),
      )
      .map((i, el) => {
        const link = loadedCheerio(el).find('a').first();
        const chapterName = link.text().trim();
        const chapterUrl = link.attr('href');

        if (!chapterUrl) return;
        const chapter: Plugin.ChapterItem = {
          name: chapterName,
          path: this.toPath(chapterUrl),
        };

        // Chapter number regex supporting acronyms (e.g. "GRMFBS CH315", "Chapter 1")
        const chapterNumber = chapterName.match(
          /(?:^|\b)(?:cap[íi]tulo|chapter|ch\.?|ep\.?|episode)\s*(\d+(?:\.\d+)?)/i,
        );
        if (chapterNumber) chapter.chapterNumber = Number(chapterNumber[1]);

        // Release time extraction from Fictioneer <time> tag
        const timeEl = loadedCheerio(el)
          .find('time.chapter-group__list-item-date, time')
          .first();
        const rawTime = timeEl.attr('datetime');
        if (rawTime) {
          const timestamp = Number(rawTime);
          if (!isNaN(timestamp) && timestamp > 0) {
            const dateMs = timestamp < 1e11 ? timestamp * 1000 : timestamp;
            chapter.releaseTime = new Date(dateMs).toISOString();
          } else {
            chapter.releaseTime = rawTime;
          }
        } else {
          const textTime = timeEl.text().trim();
          if (textTime) chapter.releaseTime = textTime;
        }

        return chapter;
      })
      .toArray();

    // The status class ("_" + lowercase Fictioneer status) is
    // language-independent; the English text is a fallback.
    const statusElement = loadedCheerio('span.story__status');
    const status = statusElement.text().trim().toLowerCase();
    if (statusElement.hasClass('_ongoing') || status.includes('ongoing'))
      novel.status = NovelStatus.Ongoing;
    else if (
      statusElement.hasClass('_completed') ||
      statusElement.hasClass('_oneshot') ||
      status.includes('completed') ||
      status.includes('complete')
    )
      novel.status = NovelStatus.Completed;
    else if (statusElement.hasClass('_canceled') || status.includes('cancel'))
      novel.status = NovelStatus.Cancelled;
    else if (statusElement.hasClass('_hiatus') || status.includes('hiatus'))
      novel.status = NovelStatus.OnHiatus;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const req = await fetchApi(this.resolveUrl(chapterPath));
    const body = await req.text();

    const loadedCheerio = loadCheerio(body);

    // chapterTransformJs HERE

    const chapterSection = loadedCheerio(
      'section#chapter-content, .chapter__content',
    );
    chapterSection
      .find(
        'script, style, iframe, .chapter__actions, .chapter__support, .chapter__footer, .chapter-index, .fictioneer-comments, .comment-section',
      )
      .remove();

    return chapterSection.find('> div').html() || chapterSection.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const req = await fetchApi(
      this.resolveUrl(
        `${pageNo === 1 ? '' : 'page/' + pageNo + '/'}?s=${encodeURIComponent(searchTerm)}&post_type=fcn_story`,
      ),
    );
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return this.parseNovels(loadedCheerio, this.selectors.searchCard);
  }
}
