import { load, load as loadCheerio } from 'cheerio';
import { fetchApi, fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { defaultCover } from '@libs/defaultCover';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelItem } from '../../test_web/static/js';
// const novelStatus = require('@libs/novelStatus');
// const isUrlAbsolute = require('@libs/isAbsoluteUrl');
// const parseDate = require('@libs/parseDate');

class Syosetu implements Plugin.PluginBase {
  id = 'yomou.syosetu';
  name = 'Syosetu';
  icon = 'src/jp/syosetu/icon.png';
  site = 'https://yomou.syosetu.com/';
  novelPrefix = 'https://ncode.syosetu.com';
  version = '1.1.0';
  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  searchUrl = (pagenum?: number, order?: string) => {
    return `https://yomou.syosetu.com/search.php?order=${order || 'hyoka'}${
      pagenum !== undefined
        ? `&p=${pagenum <= 1 || pagenum > 100 ? '1' : pagenum}` // check if pagenum is between 1 and 100
        : '' // if isn't don't set ?p
    }`;
  };
  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const getNovelsFromPage = async (pagenumber: number) => {
      // load page
      let url = this.site;

      if (!filters.genre.value) {
        url += `rank/list/type/${filters.ranking.value}_${filters.modifier.value}/?p=${pagenumber}`;
      } else {
        url += `rank/${
          filters.genre.value.length === 1 ? 'isekailist' : 'genrelist'
        }/type/${filters.ranking.value}_${filters.genre.value}${
          filters.modifier.value === 'total' ? '' : `_${filters.modifier.value}`
        }/?p=${pagenumber}`;
      }
      const html = await (await fetchApi(url)).text();

      const loadedCheerio = loadCheerio(html, {
        decodeEntities: false,
      });

      if (parseInt(loadedCheerio('.is-current').html() || '1') !== pagenumber)
        return [];

      const novels: NovelItem[] = [];
      loadedCheerio('.c-card').each((_, e) => {
        const anchor = loadedCheerio(e).find('.p-ranklist-item__title a');
        const url = anchor.attr('href');
        if (!url) return;
        const name = anchor.text();
        const novel: NovelItem = {
          path: url.replace(this.novelPrefix, ''),
          name,
          cover: defaultCover,
        };
        novels.push(novel);
      });
      return novels;
    };
    const novels = await getNovelsFromPage(pageNo);
    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    let chapters: Plugin.ChapterItem[] = [];
    const result = await fetch(this.novelPrefix + novelPath, {
      headers: this.headers,
    });
    const body = await result.text();
    const loadedCheerio = loadCheerio(body, { decodeEntities: false });

    // create novel object
    let novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.novel_title').text(),
      author: loadedCheerio('.novel_writername').text().replace('作者：', ''),
      cover: defaultCover,
    };

    // Get all the chapters
    const cqGetChapters = loadedCheerio('.novel_sublist2');
    if (cqGetChapters.length !== 0) {
      // has more than 1 chapter
      novel.summary = loadedCheerio('#novel_ex')
        .text()
        .replace(/<\s*br.*?>/g, '\n');
      cqGetChapters.each(function (i, e) {
        const chapterA = loadedCheerio(this).find('a');
        const [chapterName, releaseDate, chapterUrl] = [
          // set the variables
          chapterA.text(),
          loadedCheerio(this)
            .find('dt') // get title
            .text() // get text
            .replace(/（.）/g, '') // remove "(edited)" mark
            .trim(), // trim spaces
          chapterA.attr('href'),
        ];
        if (chapterUrl) {
          chapters.push({
            name: chapterName,
            releaseTime: releaseDate,
            path: chapterUrl,
          });
        }
      });
    } else {
      /**
       * Because there are oneshots on the site, they have to be treated with special care
       * that's what pisses me off in Shosetsu app. They have this extension,
       * but every oneshot is set as "there are no chapters" and all contents are thrown into the description!!
       */
      // get summary for oneshot chapter

      const nameResult = await fetch(this.searchUrl() + `&word=${novel.name}`, {
        headers: this.headers,
      });
      const nameBody = await nameResult.text();
      const summaryQuery = loadCheerio(nameBody, {
        decodeEntities: false,
      });
      const foundText = summaryQuery('.searchkekka_box')
        .first()
        .find('.ex')
        .text()
        .replace(/\s{2,}/g, '\n');
      novel.summary = foundText;

      // add single chapter
      chapters.push({
        name: 'Oneshot',
        releaseTime: loadedCheerio('head')
          .find("meta[name='WWWC']")
          .attr('content'), // get date from metadata
        path: novelPath, // set chapterUrl to oneshot so that chapterScraper knows it's a one-shot,
      });
    }
    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const result = await fetch(this.novelPrefix + chapterPath, {
      headers: this.headers,
    });
    const body = await result.text();

    // create cheerioQuery
    const cheerioQuery = loadCheerio(body, {
      decodeEntities: false,
    });

    let chapterText =
      cheerioQuery('#novel_honbun') // get chapter text
        .html() || '';
    return chapterText;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let novels = [];

    // returns list of novels from given page
    const getNovelsFromPage = async (pagenumber: number) => {
      // load page
      const url = this.searchUrl(pagenumber) + `&word=${searchTerm}`;
      const result = await fetch(url, { headers: this.headers });
      const body = await result.text();
      // Cheerio it!
      const cheerioQuery = loadCheerio(body, { decodeEntities: false });

      let pageNovels: Plugin.NovelItem[] = [];
      // find class=searchkekka_box
      cheerioQuery('.searchkekka_box').each((i, e) => {
        // get div with link and name
        const novelDIV = cheerioQuery(e).find('.novel_h');
        // get link element
        const novelA = novelDIV.children()[0];
        // add new novel to array
        const novelPath = novelA.attribs.href.replace(this.novelPrefix, '');
        if (novelPath) {
          pageNovels.push({
            name: novelDIV.text(), // get the name
            path: novelPath, // get last part of the link
            cover: defaultCover,
          });
        }
      });
      // return all novels from this page
      return pageNovels;
    };

    // counter of loaded pages
    // let pagesLoaded = 0;
    // do {
    //     // always load first one
    //     novels.push(...(await getNovelsFromPage(pagesLoaded + 1)));
    //     pagesLoaded++;
    // } while (pagesLoaded < maxPageLoad && isNext); // check if we should load more

    novels = await getNovelsFromPage(pageNo);

    /** Use
     * novels.push(...(await getNovelsFromPage(pageNumber)))
     * if you want to load more
     */

    // respond with novels!
    return novels;
  }
  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
  resolveUrl(path: string, isNovel?: boolean | undefined): string {
    return this.novelPrefix + path;
  }
  filters = {
    ranking: {
      type: FilterTypes.Picker,
      label: 'Ranked by',
      options: [
        { label: '日間', value: 'daily' },
        { label: '週間', value: 'weekly' },
        { label: '月間', value: 'monthly' },
        { label: '四半期', value: 'quarter' },
        { label: '年間', value: 'yearly' },
        { label: '累計', value: 'total' },
      ],
      value: 'total',
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Ranking Genre',
      options: [
        { label: '総ジャンル', value: '' },
        { label: '異世界転生/転移〔恋愛〕〕', value: '1' },
        { label: '異世界転生/転移〔ファンタジー〕', value: '2' },
        { label: '異世界転生/転移〔文芸・SF・その他〕', value: 'o' },
        { label: '異世界〔恋愛〕', value: '101' },
        { label: '現実世界〔恋愛〕', value: '102' },
        { label: 'ハイファンタジー〔ファンタジー〕', value: '201' },
        { label: 'ローファンタジー〔ファンタジー〕', value: '202' },
        { label: '純文学〔文芸〕', value: '301' },
        { label: 'ヒューマンドラマ〔文芸〕', value: '302' },
        { label: '歴史〔文芸〕', value: '303' },
        { label: '推理〔文芸〕', value: '304' },
        { label: 'ホラー〔文芸〕', value: '305' },
        { label: 'アクション〔文芸〕', value: '306' },
        { label: 'コメディー〔文芸〕', value: '307' },
        { label: 'VRゲーム〔SF〕', value: '401' },
        { label: '宇宙〔SF〕', value: '402' },
        { label: '空想科学〔SF〕', value: '403' },
        { label: 'パニック〔SF〕', value: '404' },
        { label: '童話〔その他〕', value: '9901' },
        { label: '詩〔その他〕', value: '9902' },
        { label: 'エッセイ〔その他〕', value: '9903' },
        { label: 'その他〔その他〕', value: '9999' },
      ],
      value: '',
    },
    modifier: {
      type: FilterTypes.Picker,
      label: 'Modifier',
      options: [
        { label: 'すべて', value: 'total' },
        { label: '連載中', value: 'r' },
        { label: '完結済', value: 'er' },
        { label: '短編', value: 't' },
      ],
      value: 'total',
    },
  } satisfies Filters;
}

export default new Syosetu();
