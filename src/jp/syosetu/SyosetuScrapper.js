// scraper and cheerio for scrapping from site
const { scraper } = require("../../helper");
const cheerio = require("cheerio");

const baseUrl = "https://syosetu.com"; // base url for syosetu.com

// get given page of search (if pagenum is 0 or >100 (max possible on site) see first page)
const searchUrl = (pagenum, order) => {
    return `https://yomou.syosetu.com/search.php?order=${order || "hyoka"}${
        !isNaN((pagenum = parseInt(pagenum))) // check if pagenum is a number
            ? `&p=${pagenum <= 1 || pagenum > 100 ? "1" : pagenum}` // check if pagenum is between 1 and 100
            : "" // if isn't don't set ?p
    }`;
};

// get the Syosetu ID of the chapter
const getLastPartOfUrl = (url) =>
    (ex = /.*(?=\/)(.{2,})$/.exec(url)) ? ex[1].replace(/\//g, "") : null;

// get novelUrl from Syosetu ID
const getNovelUrl = (id) => `https://ncode.syosetu.com/${id}`;

// get chapterUrl from Syosetu ID and chapter ID
const getChapterUrl = (id, chn) =>
    `https://ncode.syosetu.com/${id}${chn === "oneshot" ? "" : `/${chn}`}`;

// Because syosetu does not have any covers, I did a replacement for them
const novelCover = "https://raw.githubusercontent.com/skillgg/lnreader-sources/main/src/jp/syosetu/not_found.png";

// ID of this extension
const extensionId = 36;

// Name of this extension
const sourceName = "Syosetu";

// there are 20 mangas per page
// this is number of pages loaded in the first "batch" of loads
// TOOD: in-app dynamic loading on scroll
const maxPageLoad = 3;

const novelsScraper = async (req, res) => {
    // array of all the novels
    let novels = [];
    // returns list of novels from given page
    let getNovelsFromPage = async (pagenumber) => {
        // load page
        console.log(searchUrl(pagenumber));
        const body = await scraper(searchUrl(pagenumber || null));
        console.log("Loaded");
        // Cheerio it!
        const cheerioQuery = cheerio.load(body, { decodeEntities: false });

        console.log("Parsed");

        let pageNovels = [];
        // find class=searchkekka_box
        cheerioQuery(".searchkekka_box").each(function (i, e) {
            // get div with link and name
            const novelDIV = cheerioQuery(this).find(".novel_h");
            // get link element
            const novelA = novelDIV.children()[0];
            // add new novel to array
            pageNovels.push({
                novelName: novelDIV.text(), // get the name
                novelUrl: getLastPartOfUrl(novelA.attribs.href), // get last part of the link
                extensionId,
                novelCover, // TODO: IDK what to do about covers... On Syo they don't have them
            });
        });
        console.log("Read");
        // return all novels from this page
        return pageNovels;
    };

    // counter of loaded pages
    let pagesLoaded = 0;
    do {
        // always load first one
        novels.push(...(await getNovelsFromPage(pagesLoaded + 1)));
        pagesLoaded++;
        console.log("Added");
    } while (pagesLoaded < maxPageLoad); // check if we should load more

    /** Use
     * novels.push(...(await getNovelsFromPage(pageNumber)))
     * if you want to load more
     */

    // respond with novels!
    res.json(novels);
    console.log("Finished!");
};

const novelScraper = async (req, res) => {
    const novelUrl = getNovelUrl(req.params.novelUrl);

    let chapters = [];

    const body = await scraper(novelUrl);
    const cheerioQuery = cheerio.load(body, { decodeEntities: false });

    // create novel object
    let novel = {
        extensionId,
        sourceName,
        sourceUrl: novelUrl,
        novelUrl: req.params.novelUrl,
        novelName: cheerioQuery(".novel_title").text(),
        novelCover,
    };

    // Get all the chapters
    const cqGetChapters = cheerioQuery(".novel_sublist2");
    console.log(novelUrl, cqGetChapters.length);
    if (cqGetChapters.length !== 0) {
        // has more than 1 chapter
        novel.novelSummary = cheerioQuery("#novel_ex")
            .text()
            .replace(/<\s*br.*?>/g, "\n");
        cqGetChapters.each(function (i, e) {
            const chapterA = cheerioQuery(this).find("a");
            const [chapterName, releaseDate, chapterUrl] = [
                // set the variables
                chapterA.text(),
                cheerioQuery(this)
                    .find("dt") // get title
                    .text() // get text
                    .replace(/（.）/g, "") // remove "(edited)" mark
                    .trim(), // trim spaces
                getLastPartOfUrl(chapterA.attr("href")),
            ];
            chapters.push({ chapterName, releaseDate, chapterUrl });
        });
    } else {
        /**
         * Because there are oneshots on the site, they have to be treated with special care
         * that's what pisses me off in Shosetsu app. They have this extension,
         * but every oneshot is set as "there are no chapters" and all contents are thrown into the description!!
         */
        // get summary for oneshot chapter
        novel.novelSummary = cheerio // because there is no summary anywhere on the novel page, we have to take it from search page for a one-shot manga
            .load(await scraper(searchUrl() + `&word=${novel.novelName}`), {
                decodeEntities: false,
            })(".searchkekka_box") // find the manga in search.php
            .first()
            .find(".ex")
            .text()
            .replace(/\s{2,}/g, "\n"); // get the description as text
        // add single chapter
        chapters.push({
            chapterName: novel.novelName,
            releaseDate: cheerioQuery("head")
                .find("meta[name='WWWC']")
                .attr("content"), // get date from metadata
            chapterUrl: "oneshot", // set chapterUrl to oneshot so that chapterScraper knows it's a one-shot
        });
    }

    novel.novelChapters = chapters;

    res.json(novel);
    console.log("Finished!");
};

let chapterScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    const chapterUrl = req.params.chapterUrl;

    const url = getChapterUrl(novelUrl, chapterUrl); // get Url

    // create cheerioQuery
    const cheerioQuery = cheerio.load(await scraper(url), {
        decodeEntities: false,
    });

    // create chapter data structure
    let chapter = {
        extensionId: 1,
        novelUrl,
        chapterUrl,
        chapterName: "",
        chapterText: cheerioQuery("#novel_honbun") // get chapter text
            .text()
            .replace(/<\s*br.*?>/g, "")
            .replace(/\n{2,}/g, "\n"), // remove double breaklines
        nextChapter: null,
        prevChapter: null,
    };

    if (chapterUrl === "oneshot")
        // oneshot get name
        chapter.chapterName = cheerioQuery("#novel_title").text();
    else {
        // single chapter

        // get name
        chapter.chapterName = cheerioQuery(".novel_subtitle").first().text();

        // get next/prev buttons
        const chapterButtons = cheerioQuery(
            "#novel_contents .novel_bn"
        ).first();
        if (chapterButtons.length === 1) {
            const button = chapterButtons.find("a");
            if (button.text().match(/次/))
                chapter.nextChapter = getLastPartOfUrl(button.attr("href"));
            else chapter.prevChapter = getLastPartOfUrl(button.attr("href"));
        } else {
            const firstButton = chapterButtons.find("a").first();
            const lastButton = chapterButtons.find("a").last();
            chapter.prevChapter = getLastPartOfUrl(firstButton.attribs.href);
            chapter.nextChapter = getLastPartOfUrl(lastButton.attribs.href);
        }
    }

    res.json(chapter);
    console.log("Finished!");
};

let searchScraper = async (req, res) => {
    const searchTerm = req.query.s;
    const orderBy = req.query.o;

    // array of all the novels
    let novels = [];

    let isNext = true;

    // returns list of novels from given page
    let getNovelsFromPage = async (pagenumber) => {
        // load page
        const body = await scraper(
            searchUrl(pagenumber || null, req.query.o || null) +
                `&word=${searchTerm}`
        );
        // Cheerio it!
        const cheerioQuery = cheerio.load(body, { decodeEntities: false });

        if (cheerioQuery(".nextlink").length === 0) isNext = false;

        let pageNovels = [];
        // find class=searchkekka_box
        cheerioQuery(".searchkekka_box").each(function (i, e) {
            // get div with link and name
            const novelDIV = cheerioQuery(this).find(".novel_h");
            // get link element
            const novelA = novelDIV.children()[0];
            // add new novel to array
            pageNovels.push({
                novelName: novelDIV.text(), // get the name
                novelUrl: getLastPartOfUrl(novelA.attribs.href), // get last part of the link
                extensionId,
                novelCover, // TODO: IDK what to do about covers... On Syo they don't have them
            });
        });
        // return all novels from this page
        return pageNovels;
    };

    // counter of loaded pages
    let pagesLoaded = 0;
    do {
        // always load first one
        novels.push(...(await getNovelsFromPage(pagesLoaded + 1)));
        pagesLoaded++;
    } while (pagesLoaded < maxPageLoad && isNext); // check if we should load more

    /** Use
     * novels.push(...(await getNovelsFromPage(pageNumber)))
     * if you want to load more
     */

    // respond with novels!
    res.json(novels);
    console.log("Finished!");
};

module.exports = mtlNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
