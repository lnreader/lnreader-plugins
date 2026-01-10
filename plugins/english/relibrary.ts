import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

type FuzzySearchOptions = {
  caseSensitive: boolean;
  sort: boolean;
};

// Shamelessly stolen from 'https://raw.githubusercontent.com/wouterrutgers/fuzzy-search/master/src/FuzzySearch.mjs'
// I did modify the code a fair bit, but the algorithm is still the same under the hood.
// The original code is under ISC, which stipluate that it needs to retain the copyright notice, so here it is.
//
// It only applies to the code in the FuzzySearch Class, even though I did modify it a fair bit

/*
Copyright (c) 2016, Wouter Rutgers

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

class FuzzySearch<Item> {
  private haystack: Item[];
  private options: FuzzySearchOptions;
  private getItems: (item: Item) => string[];

  constructor(
    getItems: (item: Item) => string[],
    options: Partial<FuzzySearchOptions>,
  ) {
    this.haystack = [];
    this.options = Object.assign(
      {
        caseSensitive: false,
        sort: false,
      },
      options,
    );
    this.getItems = getItems;
  }

  getOptions(): FuzzySearchOptions {
    return this.options;
  }

  setOptions(options: Partial<FuzzySearchOptions>) {
    this.options = Object.assign(this.options, options);
  }

  setHaystack(items: Item[]) {
    this.haystack = items;
  }

  getHaystack(): Item[] {
    return this.haystack;
  }

  search(query: string): Item[] {
    if (query.length === 0) {
      return this.haystack;
    }
    const results: { item: Item; score: number }[] = [];

    for (const item of this.haystack) {
      for (const value of this.getItems(item)) {
        const score = this.isMatch(value, query);
        if (score !== undefined) {
          results.push({ item, score });
          /// We don't want to have multiple occurence of the same item, so only take one if it is found
          break;
        }
      }
    }

    if (this.options.sort) {
      results.sort((a, b) => a.score - b.score);
    }

    return results.map(result => result.item);
  }

  isMatch(item: string, query: string): number | undefined {
    if (!this.options.caseSensitive) {
      item = item.toLocaleLowerCase();
      query = query.toLocaleLowerCase();
    }

    const indexes = this.nearestIndexesFor(item, query);

    if (indexes === undefined) {
      return;
    }
    // Exact matches should be first.
    if (item === query) {
      return 1;
    }
    // If we have more than 2 letters, matches close to each other should be first.
    if (indexes.length > 1) {
      return 2 + (indexes[indexes.length - 1] - indexes[0]);
    }
    // Matches closest to the start of the string should be first.
    return 2 + indexes[0];
  }

  nearestIndexesFor(item: string, query: string): number[] | undefined {
    const letters = query.split('');
    const indexes: number[][] = [];

    const idxFL = this.idxFirstLetter(item, query);

    for (const idx of idxFL) {
      indexes.push([idx]);
      for (let i = 1; i < letters.length; i++) {
        const letter = letters[i];
        let index = item.indexOf(letter, idx + 1);
        if (index === -1) {
          indexes.pop();
          break;
        }
        indexes[indexes.length - 1].push(index);
        index++;
      }
    }

    if (indexes.length === 0) {
      return;
    }

    return indexes.sort((a, b) => {
      if (a.length === 1) {
        return a[0] - b[0];
      }

      const res_a = a[a.length - 1] - a[0];
      const res_b = b[b.length - 1] - b[0];

      return res_a - res_b;
    })[0];
  }

  idxFirstLetter(item: string, query: string): number[] {
    const match = query[0];

    return item
      .split('')
      .map((letter, index) => {
        if (letter !== match) {
          return;
        }
        return index;
      })
      .filter(index => index !== undefined) as number[];
  }
}

class ReLibraryPlugin implements Plugin.PluginBase {
  id = 'ReLib';
  name = 'Re:Library';
  icon = 'src/en/relibrary/icon.png';
  customCSS = 'src/en/relibrary/customCss.css';
  site = 'https://re-library.com';
  version = '1.1.0';
  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: 'https://re-library.com/',
    },
  };

  private searchFunc = new FuzzySearch<Plugin.NovelItem>(item => [item.name], {
    sort: true,
    caseSensitive: false,
  });

  private ensurePageOk(response: Response, body: string) {
    if (!response.ok) {
      throw new Error(`HTML Error ${response.status}: ${response.statusText}`);
    }
    const title = body.match(/<title>(.*?)<\/title>/)?.[1]?.trim();

    if (
      title &&
      (title == 'Bot Verification' ||
        title == 'You are being redirected...' ||
        title == 'Un instant...' ||
        title == 'Just a moment...' ||
        title == 'Redirecting...')
    ) {
      throw new Error('Captcha error, please open in webview');
    }
  }

  private ensureCover(coverUrl: string | undefined) {
    if (!coverUrl) return defaultCover;

    if (coverUrl.endsWith('no-image.png')) return defaultCover;

    return coverUrl;
  }

  private async popularNovelsInner(url: string): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const result = await fetchApi(url);
    const body = await result.text();
    await this.ensurePageOk(result, body);

    const $ = loadCheerio(body);
    $('.entry-content > ol > li').each((_i, el) => {
      const novel: Partial<Plugin.NovelItem> = {};
      novel.name = $(el).find('h3 > a').text();
      novel.path = $(el).find('table > tbody > tr > td > a').attr('href');
      if (novel.name === undefined || novel.path === undefined) return;
      novel.cover = this.ensureCover(
        $(el).find('table > tbody > tr > td > a > img').attr('data-cfsrc') ||
          $(el).find('table > tbody > tr > td > a > img').attr('src'),
      );
      if (novel.path.startsWith(this.site)) {
        novel.path = novel.path.slice(this.site.length);
      }
      novels.push(novel as Plugin.NovelItem);
    });
    return novels;
  }

  private async lastestNovelsInner(url: string): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const result = await fetchApi(url);
    const body = await result.text();
    await this.ensurePageOk(result, body);

    const $ = loadCheerio(body);
    $('article.type-page.page').each((_i, el) => {
      const novel: Partial<Plugin.NovelItem> = {};
      novel.name = $(el).find('.entry-title').text();
      novel.path = $(el).find('.entry-title a').attr('href');
      if (novel.path === undefined || novel.name === undefined) return;
      novel.cover = this.ensureCover(
        $(el)
          .find('.entry-content > table > tbody > tr > td > a >img')
          .attr('data-cfsrc') ||
          $(el)
            .find('.entry-content > table > tbody > tr > td > a >img')
            .attr('src'),
      );
      if (novel.path.startsWith(this.site)) {
        novel.path = novel.path.slice(this.site.length);
      }
      novels.push(novel as Plugin.NovelItem);
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    // The most-popular page only has a single page, so we return an empty array in case you ask for the impossible
    // the lastest page do have paginated result, so we support that.
    if (showLatestNovels)
      return this.lastestNovelsInner(
        `${this.site}/tag/translations/page/${pageNo}`,
      );
    else if (pageNo === 1)
      return this.popularNovelsInner(`${this.site}/translations/most-popular/`);
    else return [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
    };
    // title:		.entry-content > header.entry-header > .entry-title
    // img:			.entry-content > table > tbody > tr > td > img
    // tags:		.entry-content > table > tbody > tr > td > p > span > a[]
    // synopis:		.entry-content > div.su-box > div.su-box-content
    // chapters:	.entry-content > div.su-accordion <then> li.page_item[]

    const result = await fetchApi(`${this.site}/${novelPath}`);
    const body = await result.text();
    await this.ensurePageOk(result, body);

    const $ = loadCheerio(body);

    // If it doesn't find the name I should just throw an error (or early return) since the scraping is broken
    novel.name = $('header.entry-header > .entry-title').text().trim();

    if (novel.name === undefined || novel.name === '404 – Page not found')
      throw new Error(`Invalid novel for url ${novelPath}`);

    // Find the cover
    novel.cover = this.ensureCover(
      // $('.entry-content > table > tbody > tr > td > a > img')
      $('.entry-content > table img').attr('data-cfsrc') ||
        $('.entry-content > table img').attr('src'),
    );

    novel.status = NovelStatus.Unknown;
    $('.entry-content > table > tbody > tr > td > p').each(function (_i, el) {
      // Handle the novel status
      // Sadly some novels just state the status inside the summary...
      if (
        $(el).find('strong').text().toLowerCase().trim().startsWith('status')
      ) {
        $(el).find('strong').remove();
        const status = $(el).text().toLowerCase().trim();
        if (status.includes('on-going')) {
          novel.status = NovelStatus.Ongoing;
        } else if (status.includes('completed')) {
          novel.status = NovelStatus.Completed;
        } else if (status.includes('hiatus')) {
          novel.status = NovelStatus.OnHiatus;
        } else if (status.includes('cancelled')) {
          novel.status = NovelStatus.Cancelled;
        } else {
          novel.status = loadCheerio(el).text();
        }
      }
      // Handle the genres
      else if (
        $(el).find('strong').text().toLowerCase().trim().startsWith('Category')
      ) {
        $(el).find('strong').remove();
        // previously, list of '> span > a'
        novel.genres = $(el).text();
      }
    });

    // Handle the author names
    // Both the author and the translator (if present) seem to be written out as links,
    // and the paragraph should contain at most two of them (they SHOULD always be first).
    $('.entry-content > table > tbody > tr > td > span:has(> a)').each(
      (_i, el) => {
        const $el = $(el);
        novel.author = $el.find('a:nth-child(1)').text();
        const translator = $el.find('a:nth-child(2)').first().text();
        if (!!translator) {
          novel.author += ` (translated by: ${translator})`;
        }
      },
    );

    novel.summary = $(
      '.entry-content > div.su-box > div.su-box-content',
    ).text();

    const chapters: (Plugin.ChapterItem & { epoch: number | null })[] = [];

    let chapter_idx = 0;
    $('.entry-content > div.su-accordion').each((_i1, el) => {
      $(el)
        .find('li:has(> a)')
        .each((_i2, chap_el) => {
          const $a = $(chap_el).find('a');

          let chap_path = $a.attr('href')?.trim();
          if ($a.text() === undefined || chap_path === undefined) return;
          if (chap_path.startsWith(this.site)) {
            chap_path = chap_path.slice(this.site.length);
          }

          const epochStr = $(chap_el).attr('data-date');
          // if we can't get the released time (at least without any additional fetches), set it to null purposfully
          let epoch = null;
          let releaseTime = null;
          if (!!epochStr) {
            epoch = parseInt(epochStr);
            if (!isNaN(epoch)) {
              releaseTime = new Date(epoch * 1000).toISOString();
            }
          }

          chapters.push({
            name: $a.text(),
            path: chap_path,
            chapterNumber: 0,
            // we KNOW that we can't get the released time (at least without any additional fetches), so set it to null purposfully
            releaseTime,
            epoch,
          });
        });
    });
    chapters.map((c, i) => {
      c.chapterNumber = i + 1;
      return c;
    });

    novel.chapters = chapters;
    return novel as Plugin.NovelItem;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // parse chapter text here
    const result = await fetchApi(`${this.site}/${chapterPath}`);
    const body = await result.text();
    await this.ensurePageOk(result, body);

    const $ = loadCheerio(body);
    const postId = $('article').attr('id')?.split('-')?.[1] ?? null;

    const content = $('article > div.entry-content');
    let topDelimiter = postId
      ? content.find('> p:has(> span#more-' + postId + ')')
      : undefined;
    if (topDelimiter == null) {
      topDelimiter = content.find('> p:nth-child(1)');
    }

    if (topDelimiter != null) {
      topDelimiter.prevAll().remove();
      topDelimiter.remove();
    }

    content.find('div:has(>div.ad-slot)').remove();

    const footnotes = content.find('ol.easy-footnotes-wrapper');

    // TODO: use the buttons instead?
    const btmDelimiter = content.find('> hr:has(~ hr#ref)').last();
    let authorNote = null;
    if (btmDelimiter != null) {
      authorNote = btmDelimiter.next('p');

      btmDelimiter.nextAll().remove();
      btmDelimiter.remove();
    }

    // this is a really weird hack that some chapters of one specific novel do.
    // I need to check if any others have a problem like this.
    // Generally, we need to set up some kind of large-scale testing for
    // edge cases like this.
    content.find('p:has(>code)+code:has(+p:has(>code))').each((_i, el) => {
      if (
        el.attribs.style.match(/(.*?;)?font-family: 'Merriweather', serif.*/)
      ) {
        $(el.prev!!).remove();
        $(el.next!!).remove();
        $(el).children().unwrap();
      }
    });

    content.append(footnotes);
    if (authorNote != null) {
      content.append(`
        <blockquote class="author_note">
          <p>${authorNote.text()}</p>
        </blockquote>
        `);
    }

    content.find('div.PageLink').remove();
    content.find('table#fixed').remove();

    return content.html() ?? '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // We only want to serve a single "page" since we do the search client side.
    if (pageNo !== 1) return [];

    const novels: Plugin.NovelItem[] = [];
    const result = await fetchApi(`${this.site}/translations/`);
    const body = await result.text();
    await this.ensurePageOk(result, body);

    const $ = loadCheerio(body);

    $('article article').each((_i, el) => {
      const e = $(el);
      if (e.find('a').attr('href') && e.find('a').text()) {
        novels.push({
          name: e.find('h4').text(),
          path: e.find('a').attr('href')?.replace(this.site, '') || '',
          cover:
            e.find('img').attr('data-cfsrc') ||
            e.find('img').attr('src') ||
            defaultCover,
        });
      }
    });
    this.searchFunc.setHaystack(novels);
    return this.searchFunc.search(searchTerm);
  }
}

export default new ReLibraryPlugin();
