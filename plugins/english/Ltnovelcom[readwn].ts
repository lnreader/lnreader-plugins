
    import { load as parseHTML } from "cheerio";
    // import dayjs from 'dayjs';
    import { fetchFile, fetchApi } from "@libs/fetch";
    import { Novel, Plugin, Chapter } from "@typings/plugin";
    // import { parseMadaraDate } from "@libs/parseMadaraDate";
    // import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
    // import { showToast } from "@libs/showToast";
    // import { Filter, FilterInputs } from "@libs/filterInputs";
    // import { NovelStatus } from '@libs/novelStatus';
    // import { defaultCover } from "@libs/defaultCover";
    
    
    export const id = "Ltnovel.com";
    export const name = "Ltnovel.com";
    export const icon = "multisrc/readwn/icon/ltnovel.png";
    export const version = "1.0.0";
    export const site = "https://www.ltnovel.com/";
    // export const filters: Filter[] = [];
    
    const baseUrl = site;
    
    export const popularNovels: Plugin.popularNovels = async function (
        page,
        { filters, showLatestNovels }
    ) {
        const novels: Novel.Item[] = [];
        const pageNo = page - 1;
    
        const url = baseUrl + 'list/all/all-onclick-' + pageNo +'.html';
    
        const result = await fetchApi(url);
        const body = await result.text();
    
        const loadedCheerio = parseHTML(body);
    
    
        loadedCheerio('li.novel-item').each(function () {
            const novelName = loadedCheerio(this).find('h4').text();
            const novelUrl = baseUrl + loadedCheerio(this).find('a').attr('href');
    
            const coverUri = loadedCheerio(this)
                .find('.novel-cover > img')
                .attr('data-src');
    
            const novelCover = baseUrl + coverUri;
    
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
            novel.cover = baseUrl + coverUri;
    
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
    
            const novelId = novelUrl.replace('.html', '').replace(baseUrl, '');
    
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
    
                const chapterUrl = baseUrl + loadedCheerio(this).find('a').attr('href')?.trim();
    
                const releaseDate = loadedCheerio(this)
                    .find('a .chapter-update')
                    .text()
                    .trim();
    
                lastChapterNo = parseInt(loadedCheerio(this).find('a .chapter-no').text().trim());
    
                const chapter = { name: chapterName, releaseTime: releaseDate, url: chapterUrl };
    
                novelChapters.push(chapter);
            });
    
            // Itterate once more before loop to finish off
            lastChapterNo++;
            for (let i = lastChapterNo; i <= latestChapterNo; i++) {
                const chapterName = 'Chapter ' + i;
                const chapterUrl = baseUrl + novelId+'_'+ i +'.html';
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
        const searchUrl = baseUrl + 'e/search/index.php';
    
        const result = await fetchApi(searchUrl, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: baseUrl + 'search.html',
            Origin: baseUrl,
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
          const novelUrl = baseUrl + loadedCheerio(this).find('a').attr('href');
    
          const coverUri = baseUrl + loadedCheerio(this).find('img').attr('data-src');
          const novelCover = baseUrl + coverUri;
          const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
          };
    
          novels.push(novel);
        });
        return novels;
    };
    
    export const fetchImage: Plugin.fetchImage = async (url) => {
        return await fetchFile(url, {});
    };
    
    