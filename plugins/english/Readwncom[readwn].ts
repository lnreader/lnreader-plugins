
import { load as parseHTML } from "cheerio";
// import dayjs from 'dayjs';
import { fetchFile, fetchApi } from "@libs/fetch";
import { Novel, Plugin, Chapter } from "@typings/plugin";
import { parseMadaraDate } from "@libs/parseMadaraDate";
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { showToast } from "@libs/showToast";
import { FilterInputs } from "@libs/filterInputs";
// import { NovelStatus } from '@libs/novelStatus';
// import { defaultCover } from "@libs/defaultCover";

export const id = "Readwn.com";
export const name = "Readwn.com";
export const icon = "multisrc/readwn/icons/readwn.png";
export const version = "1.0.0";
export const site = "https://www.readwn.com/";

export const popularNovels: Plugin.popularNovels = async function (
  page,
  { filters, showLatestNovels }
) {
  const novels: Novel.Item[] = [];
  const pageNo = page - 1;

  let url = site + 'list/';
  url += (filters?.genres || 'all') + '/';
  url += (filters?.status || 'all') + '-';
  url += (showLatestNovels ? 'lastdotime' : filters?.sort || 'newstime') + '-';
  url += pageNo + '.html';

  const result = await fetchApi(url);
  const body = await result.text();

  const loadedCheerio = parseHTML(body);


  loadedCheerio('li.novel-item').each(function () {
    const novelName = loadedCheerio(this).find('h4').text();
    const novelUrl = site + loadedCheerio(this).find('a').attr('href');

    const coverUri = loadedCheerio(this)
      .find('.novel-cover > img')
      .attr('data-src');

    const novelCover = site + coverUri;

    const novel = { name: novelName, cover: novelCover, url: novelUrl };

    novels.push(novel);
  });

  return novels;
};


export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
  async function (novelUrl) {
    const result = await fetchApi(novelUrl);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    const novel: Novel.instance = {
      url: novelUrl,
      chapters: [],
    };

    novel.name = loadedCheerio('h1.novel-title').text();

    const coverUri = loadedCheerio('figure.cover > img').attr('data-src');
    novel.cover = site + coverUri;

    novel.summary = loadedCheerio('.summary')
      .text()
      .replace('Summary', '')
      .trim();

    novel.genres = '';

    loadedCheerio('div.categories > ul > li').each(function () {
      novel.genres += loadedCheerio(this).text().trim() + ',';
    });

    loadedCheerio('div.header-stats > span').each(function () {
      if (loadedCheerio(this).find('small').text() === 'Status') {
        novel.status = loadedCheerio(this).find('strong').text();
      }
    });

    novel.genres = novel.genres.slice(0, -1);

    novel.author = loadedCheerio('span[itemprop=author]').text();

    let novelChapters: Chapter.Item[] = [];

    const novelId = novelUrl.replace('.html', '').replace(site, '');

    const latestChapterNo = parseInt(loadedCheerio('.header-stats')
      .find('span > strong')
      .first()
      .text()
      .trim());

    let lastChapterNo = 1;
    loadedCheerio('.chapter-list li').each(function () {
      const chapterName = loadedCheerio(this)
        .find('a .chapter-title')
        .text()
        .trim();

      const chapterUrl = site + loadedCheerio(this).find('a').attr('href')?.trim();

      const releaseDate = loadedCheerio(this)
        .find('a .chapter-update')
        .text()
        .trim();

      lastChapterNo = parseInt(loadedCheerio(this).find('a .chapter-no').text().trim());

      const chapter = { name: chapterName, releaseTime: parseMadaraDate(releaseDate), url: chapterUrl };

      novelChapters.push(chapter);
    });

    // Itterate once more before loop to finish off
    lastChapterNo++;
    for (let i = lastChapterNo; i <= latestChapterNo; i++) {
      const chapterName = 'Chapter ' + i;
      const chapterUrl = site + novelId+'_'+ i +'.html';
      const releaseDate = null;

      const chapter = { name: chapterName, releaseTime: releaseDate,url:  chapterUrl };

      novelChapters.push(chapter);
    }

    novel.chapters = novelChapters;
    return novel;
  };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
  const result = await fetchApi(chapterUrl);
  const body = await result.text();

  const loadedCheerio = parseHTML(body);

  const chapterText = loadedCheerio('.chapter-content').html();
  return chapterText;
};

export const searchNovels: Plugin.searchNovels = async (searchTerm) => {
  const novels: Novel.Item[] = [];
  const searchUrl = site + 'e/search/index.php';

  const result = await fetchApi(searchUrl, {
    headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Referer: site + 'search.html',
    Origin: site,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36',
    },
    method: 'POST',
    body: JSON.stringify({
    show: 'title',
    tempid: 1,
    tbname: 'news',
    keyboard: searchTerm,
    }),
  });
  const body = await result.text();

  const loadedCheerio = parseHTML(body);

  loadedCheerio('li.novel-item').each(function () {
    const novelName = loadedCheerio(this).find('h4').text();
    const novelUrl = site + loadedCheerio(this).find('a').attr('href');

    const coverUri = site + loadedCheerio(this).find('img').attr('data-src');
    const novelCover = site + coverUri;
    const novel = {
    name: novelName,
    cover: novelCover,
    url: novelUrl,
    };

    novels.push(novel);
  });
  return novels;
};

export const fetchImage: Plugin.fetchImage = fetchFile;

export const filters = [{"key":"sort","label":"Sort By","values":[{"label":"New","value":"newstime"},{"label":"Popular","value":"onclick"},{"label":"Updates","value":"lastdotime"}], "inputType":FilterInputs.Picker},{"key":"status","label":"Status","values":[{"label":"All","value":"all"},{"label":"Completed","value":"Completed"},{"label":"Ongoing","value":"Ongoing"}], "inputType":FilterInputs.Picker},{"key":"genres","label":"Genre / Category","values":[{"label":"All","value":"all"},{"label":"Action","value":"action"},{"label":"Adventure","value":"adventure"},{"label":"Chinese","value":"chinese"},{"label":"Comedy","value":"comedy"},{"label":"Contemporary Romance","value":"contemporary-romance"},{"label":"Drama","value":"drama"},{"label":"Eastern Fantasy","value":"eastern-fantasy"},{"label":"Ecchi","value":"ecchi"},{"label":"Erciyuan","value":"erciyuan"},{"label":"Faloo","value":"faloo"},{"label":"Fan-Fiction","value":"fan-fiction"},{"label":"Fantasy","value":"fantasy"},{"label":"Fantasy Romance","value":"fantasy-romance"},{"label":"Game","value":"game"},{"label":"Gender Bender","value":"gender-bender"},{"label":"Harem","value":"harem"},{"label":"Hentai","value":"hentai"},{"label":"Historical","value":"historical"},{"label":"Horror","value":"horror"},{"label":"Isekai","value":"isekai"},{"label":"Japanese","value":"japanese"},{"label":"Josei","value":"josei"},{"label":"Korean","value":"korean"},{"label":"Lolicon","value":"lolicon"},{"label":"Magic","value":"magic"},{"label":"Magical Realism","value":"magical-realism"},{"label":"Martial Arts","value":"martial-arts"},{"label":"Mecha","value":"mecha"},{"label":"Military","value":"military"},{"label":"Mystery","value":"mystery"},{"label":"Official Circles","value":"official_circles"},{"label":"Psychological","value":"psychological"},{"label":"Romance","value":"romance"},{"label":"School Life","value":"school-life"},{"label":"Sci-fi","value":"sci-fi"},{"label":"Science Fiction","value":"science_fiction"},{"label":"Seinen","value":"seinen"},{"label":"Shoujo","value":"shoujo"},{"label":"Shoujo Ai","value":"shoujo-ai"},{"label":"Shounen","value":"shounen"},{"label":"Shounen Ai","value":"shounen-ai"},{"label":"Slice of Life","value":"slice-of-life"},{"label":"Sports","value":"sports"},{"label":"Supernatural","value":"supernatural"},{"label":"Suspense Thriller","value":"suspense_thriller"},{"label":"Tragedy","value":"tragedy"},{"label":"Travel Through Time","value":"travel_through_time"},{"label":"Two-dimensional","value":"two-dimensional"},{"label":"Urban","value":"urban"},{"label":"Urban Life","value":"urban-life"},{"label":"Video Games","value":"video-games"},{"label":"Virtual Reality","value":"virtual-reality"},{"label":"Wuxia","value":"wuxia"},{"label":"Wuxia Xianxia","value":"wuxia_xianxia"},{"label":"Xianxia","value":"xianxia"},{"label":"Xuanhuan","value":"xuanhuan"},{"label":"Yaoi","value":"yaoi"},{"label":"Yuri","value":"yuri"}], "inputType":FilterInputs.Picker}];