import { fetchApi, fetchProto, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterToValues, FilterTypes } from '@libs/filterInputs';
import { CheerioAPI, load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { storage /*localStorage, sessionStorage*/ } from '@libs/storage';
// import { encode, decode } from 'urlencode';
// import dayjs from 'dayjs';
// import { Parser } from 'htmlparser2';

class MzNovelsPlugin implements Plugin.PluginBase {
  id = 'mznovels';
  name = 'MZ Novels';
  icon = 'src/en/mznovels/icon.png';
  customCSS = 'src/en/mznovels/customCss.css';
  customJS = 'src/en/mznovels/customJs.js';
  site = 'https://mznovels.com';
  version = '1.0.1';
  filters = {
    rank_type: {
      label: 'Ranking Type',
      options: [
        { label: 'Original', value: 'original' },
        { label: 'Translated', value: 'translated' },
        { label: 'Fanfiction', value: 'fanfiction' },
      ],
      type: FilterTypes.Picker,
      value: 'original',
    },
    rank_period: {
      label: 'Ranking Period',
      options: [
        { label: 'Daily', value: 'daily' },
        { label: 'Weekly', value: 'weekly' },
        { label: 'Monthly', value: 'monthly' },
      ],
      type: FilterTypes.Picker,
      value: 'daily',
    },
  } satisfies Filters;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;

  pluginSettings = {
    authorNotes: {
      label: 'Author Notes',
      type: FilterTypes.Picker,
      value: 'footnotes',
      options: [
        { label: 'Inline', value: 'inline' },
        { label: 'Footnotes', value: 'footnotes' },
        { label: 'None', value: 'none' },
      ],
    },
  } satisfies Plugin.PluginSettings;

  //flag indicates whether access to LocalStorage, SesesionStorage is required.
  webStorageUtilized?: boolean = false;

  normalizePath(path: string, withDomain?: boolean): string;
  normalizePath(
    path: string | undefined,
    withDomain?: boolean,
  ): string | undefined;
  normalizePath(path: string | undefined, withDomain: boolean = true) {
    if (!path) {
      return path;
    }
    if (path.startsWith('/')) {
      if (withDomain) {
        return this.site + path;
      }
      return path;
    } else {
      if (!path.startsWith(this.site)) {
        console.warn("path doesn't seem to belong to this site");
      }
      if (!withDomain) {
        return path.slice(this.site.length);
      }
      return path;
    }
  }

  normalizeAvatar(path: string) {
    path = this.normalizePath(path, true);
    if (path === 'https://mznovels.com/media/avatars/default.png') {
      return defaultCover;
    }
    return path;
  }

  parseSearchResults($: CheerioAPI, pageNo: number): Plugin.NovelItem[] {
    // When a page number larger than the max is used, mznovels simply repeats the final page.
    // Here we detect this and return an empty page instead.
    const curPage = $('div.pagination > span.active').text();
    if (curPage !== pageNo.toString()) {
      // throw new Error(`Incorrect page ${curPage} when searching for page ${pageNo}`);
      return [];
    }

    const novels: Plugin.NovelItem[] = [];
    $(
      'ul.search-results-list > li.search-result-item:not(.ad-result-item)',
    ).each((idx, ele) => {
      const $ele = $(ele);
      const name = $ele.find('h2.search-result-title').first().text();
      const path = this.normalizePath(
        $ele.find('a.search-result-title-link').first().attr('href'),
      );
      const cover =
        this.normalizePath($ele.find('img.search-result-image').attr('src')) ??
        defaultCover;
      if (path) {
        novels.push({ name, path, cover });
      }
    });
    return novels;
  }

  applyLocalFilters(
    novels: Plugin.NovelItem[],
    filters: FilterToValues<typeof this.filters>,
  ): Plugin.NovelItem[] {
    // TODO
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url: string;
    if (showLatestNovels) {
      url = this.normalizePath(`/latest-updates/?page=${pageNo}`);
    } else {
      url = this.normalizePath(
        `/rankings/${filters?.rank_type?.value ?? 'original'}?period=${filters?.rank_period?.value ?? 'daily'}&page=${pageNo}`,
      );
    }
    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }
    const body = await result.text();
    const loadedCheerio = loadCheerio(body);

    // TODO: if I apply the filters here, but one search page doesn't happen to contain any matches, LNReader will believe there are no more pages!
    // This means that the page numbers for this function and the website need to be diverged in a consistent way. How?
    return this.parseSearchResults(loadedCheerio, pageNo);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    const url = this.normalizePath(novelPath);
    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }
    const body = await result.text();
    const $ = loadCheerio(body);

    // TODO: get here data from the site and
    // un-comment and fill-in the relevant fields

    novel.name = $('h1.novel-title').first().text();
    novel.cover =
      this.normalizePath($('img#novel-cover-image').attr('src')) ??
      defaultCover;

    // Original, Translated, Fanfiction
    const categoryStr = $('span.category-value').text();
    let category;
    switch (categoryStr) {
      case 'Original':
        category = 'original';
        break;
      case 'Translated':
        category = 'translated';
        break;
      case 'Fanfiction':
        category = 'fanfiction';
        break;
      default:
        category = null;
        break;
    }

    let author = $('p.novel-author > a').text();
    if (category === 'translated') {
      let origAuthor = 'Unknown';
      $('div.translation-info-item').each((idx, ele) => {
        const $ele = $(ele);
        if (
          $ele.find('span.translation-label').text() === 'Original Author:' &&
          !$ele.find('span.translation-value').hasClass('not-provided')
        ) {
          origAuthor = $ele.find('span.translation-value').text();
        }
      });

      author = `${origAuthor} (translated by: ${author})`;
    }

    // novel.artist = '';
    novel.author = author;

    const tags = [];
    if (category) {
      tags.push(`Category: ${category}`);
    }

    $('div.genres-container > a.genre').each((idx, ele) => {
      tags.push($(ele).text().replace(',', '_'));
    });

    $('div.tags-container > a.tag').each((idx, ele) => {
      tags.push($(ele).text().replace(',', '_'));
    });

    novel.genres = tags.join(', ');

    const statusIndicator = $('span.status-indicator');
    novel.status = statusIndicator.hasClass('completed')
      ? NovelStatus.Completed
      : NovelStatus.Ongoing;

    novel.summary = (
      $('p.summary-text').prop('innerHTML') ?? '<no description>'
    ).trim();
    const ratingStr = $('span.rating-score').text();
    if (ratingStr) {
      const ratingNum = ratingStr.match(/^\((\d+\.\d+)\)$/)?.groups?.[1];
      if (ratingNum) {
        novel.rating = parseFloat(ratingNum);
      }
    }

    let pageNo = 1;
    let $page = $;
    const lastPageLink = $('div#chapters .pagination')
      .children()
      .last()
      .filter((i, el) => el.tagName === 'a')
      .attr('href');
    const maxPage = lastPageLink ? parseInt(lastPageLink.split('=')[1]) : 1;
    const chaptersBackwards: Plugin.ChapterItem[] = [];

    while (pageNo <= maxPage) {
      if (pageNo > 1) {
        const pageUrl = url + `?page=${pageNo}`;
        const res = await fetchApi(pageUrl);
        if (!res.ok) {
          throw new Error('Captcha error, please open in webview');
        }
        $page = loadCheerio(await res.text());
      }
      $page('ul.chapter-list > li.chapter-item').each((idx, el) => {
        const $el = $page(el);
        chaptersBackwards.push({
          name: $el.find('span.chapter-title-text').text(),
          path: this.normalizePath($el.find('a.chapter-link').attr('href'))!!,
          // releaseTime: $el.find('span.chapter-date').text(),
        });
      });
      pageNo++;
    }

    const chapters = chaptersBackwards.reverse().map((v, i) => {
      v.chapterNumber = i + 1;
      return v;
    });

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.normalizePath(chapterPath);
    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }
    const body = await result.text();
    const $ = loadCheerio(body);

    const content = $('div.formatted-content');
    content.remove('div.chapter-ad-banner');

    const authorNotes = $('.author-feedback');
    const authorNotesMode =
      storage.get('authorNotes') ?? this.pluginSettings.authorNotes.value; // TODO: needs to be done properly in LNReader
    console.log(storage.getAllKeys().map(k => [k, storage.get(k)]));
    if (authorNotesMode !== 'inline') {
      console.log(authorNotes);
      if (authorNotesMode === 'footnotes') {
        const footnotes: string[] = [];
        authorNotes.each((i, el) => {
          const $el = $(el);
          const content = $el.attr('data-note');
          if (!content) return;

          footnotes.push(content);
          $el.append(
            `<a class="footnote-ref" href="#footnote-${i + 1}"><sup>${i + 1}</sup><span class="anchor"><span id="ref-${i + 1}"></span></span></a>`,
          );
        });
        console.log(footnotes);
        content.append(`
          <div class="footnotes">
            ${footnotes
              .map(
                (v, i) => `
                <a class="footnote-num" href="#ref-${i + 1}"><span class="anchor"><span id="footnote-${i + 1}"></span></span><sup>${i + 1}</sup></a>
                <span class="footnote-content">${v}</span>
            `,
              )
              .join('')}
          </div>
        `);
      }
      authorNotes.children().unwrap();
    }

    $('.author_note > .note_content').each((i, el) => {
      content.append(`
        <blockquote class="author_note">
          <h3>Author's Note</h3>
          <p>${$(el).text()}</p>
        </blockquote>
        `);
    });

    return content.html()!!;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.normalizePath(`/search/?q=${searchTerm}`);
    const result = await fetchApi(url);
    if (!result.ok) {
      throw new Error('Captcha error, please open in webview');
    }
    const body = await result.text();
    const loadedCheerio = loadCheerio(body);

    return this.parseSearchResults(loadedCheerio, pageNo);
  }

  resolveUrl = (path: string, isNovel?: boolean) => this.normalizePath(path);
}

export default new MzNovelsPlugin();