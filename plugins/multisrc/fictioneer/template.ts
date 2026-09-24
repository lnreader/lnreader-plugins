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
  novelTitle: 'h1.story__identity-title',
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
    this.version = `1.2.${0 + versionIncrements}`;
    this.options = metadata.options;
    this.selectors = { ...defaultSelectors, ...metadata.options?.selectors };
  }

  private toPath(url: string): string {
    const path = new URL(url, this.site).pathname.substring(1);
    return this.options.trimTrailingSlash ? path.replace(/\/$/, '') : path;
  }

  private parseNovels(
    loadedCheerio: CheerioAPI,
    selector: string,
  ): Plugin.NovelItem[] {
    return loadedCheerio(selector)
      .map((i, el) => {
        const element = loadedCheerio(el);
        const title = element.find(this.selectors.cardTitle);
        const novelName = title.text();
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
        this.site +
          `/${pageNo === 1 ? '' : 'page/' + pageNo + '/'}?s=&post_type=fcn_story&orderby=modified&order=desc`,
      );
      const body = await req.text();
      const loadedCheerio = loadCheerio(body);

      return this.parseNovels(loadedCheerio, this.selectors.searchCard);
    }

    const req = await fetchApi(
      this.site +
        '/' +
        this.options.browsePage +
        '/' +
        (pageNo === 1 ? '' : 'page/' + pageNo + '/'),
    );
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return this.parseNovels(loadedCheerio, this.selectors.browseCard);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const req = await fetchApi(this.site + '/' + novelPath + '/');
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio(this.selectors.novelTitle).text(),
    };

    // novel.artist = '';
    const author = loadedCheerio(this.selectors.novelAuthor).text();
    // The default selector matches the "Author: X | ..." meta line, while an
    // override is expected to match the author name itself.
    novel.author = this.options.selectors?.novelAuthor
      ? author.trim()
      : author.split('|')[0].replace('Author: ', '').replace('by ', '').trim();
    const cover = loadedCheerio(this.selectors.novelCover);
    novel.cover =
      cover.attr('data-src') || cover.attr('src') || cover.attr('href');
    novel.genres = loadedCheerio('div.tag-group > a, section.tag-group > a')
      .map((i, el) => loadedCheerio(el).text())
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
        const chapterName = loadedCheerio(el).find('a').text();
        const chapterUrl = loadedCheerio(el).find('a').attr('href');

        if (!chapterUrl) return;
        const chapter: Plugin.ChapterItem = {
          name: chapterName,
          path: this.toPath(chapterUrl),
        };
        const chapterNumber = chapterName.match(
          /^(?:cap[íi]tulo|chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i,
        );
        if (chapterNumber) chapter.chapterNumber = Number(chapterNumber[1]);
        return chapter;
      })
      .toArray();

    // The status class ("_" + lowercase Fictioneer status) is
    // language-independent; the English text is a fallback.
    const statusElement = loadedCheerio('span.story__status');
    const status = statusElement.text().trim();
    if (statusElement.hasClass('_ongoing') || status === 'Ongoing')
      novel.status = NovelStatus.Ongoing;
    if (
      statusElement.hasClass('_completed') ||
      statusElement.hasClass('_oneshot') ||
      status === 'Completed'
    )
      novel.status = NovelStatus.Completed;
    if (
      statusElement.hasClass('_canceled') ||
      status === 'Canceled' ||
      status === 'Cancelled'
    )
      novel.status = NovelStatus.Cancelled;
    if (statusElement.hasClass('_hiatus') || status === 'Hiatus')
      novel.status = NovelStatus.OnHiatus;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const req = await fetchApi(this.site + '/' + chapterPath + '/');
    const body = await req.text();

    const loadedCheerio = loadCheerio(body);

    // chapterTransformJs HERE

    loadedCheerio('section#chapter-content')
      .find('script, style, iframe')
      .remove();

    return loadedCheerio('section#chapter-content > div').html() || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const req = await fetchApi(
      this.site +
        `/${pageNo === 1 ? '' : 'page/' + pageNo + '/'}?s=${encodeURIComponent(searchTerm)}&post_type=fcn_story`,
    );
    const body = await req.text();
    const loadedCheerio = loadCheerio(body);

    return this.parseNovels(loadedCheerio, this.selectors.searchCard);
  }

  resolveUrl = (path: string) =>
    this.site.replace(/\/+$/, '') + '/' + path.replace(/^\/+|\/+$/g, '') + '/';
}
