const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");
const { scraper } = require("../../helper");

const baseUrl = "https://www.lightnovelpub.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl + "browse/all/popular/all/1";

    const body = await scraper(url);

    $ = cheerio.load(body);

    let novels = [];

    $(".novel-item.ads").remove();

    $(".novel-item").each(function (result) {
        const novelName = $(this)
            .find(".novel-title")
            .text()
            .replace(/[\t\n]/g, "");

        const novelCover = $(this).find("img").attr("data-src");

        let novelUrl = $(this)
            .find(".novel-title > a")
            .attr("href")
            .replace(`/novel/`, "");
        novelUrl += "/";

        const novel = {
            extensionId: 15,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

const novelScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    const url = `${baseUrl}novel/${novelUrl}/`;

    const body = await scraper(url);

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 15;

    novel.sourceName = "LightNovelPub";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $("h1.novel-title")
        .text()
        .replace(/[\t\n]/g, "")
        .trim();

    novel.novelCover = $("figure.cover > img").attr("src");

    novel["Genre(s)"] = "";

    $("div.categories > ul > li").each(function (result) {
        novel["Genre(s)"] +=
            $(this)
                .text()
                .replace(/[\t\n]/g, "") + ",";
    });

    $("div.header-stats > span").each(function (result) {
        if ($(this).find("small").text() === "Status") {
            novel.Status = $(this).find("strong").text();
        }
    });

    novel["Genre(s)"] = novel["Genre(s)"].slice(0, -1);

    novel["Author(s)"] = $(".author > a > span").text();

    novelSummary = $(".summary > .content").html();
    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    let firstChapterNo, totalChapters;

    totalChapters = $(".header-stats > span").first().text().match(/\d+/)[0];
    firstChapterNo = $(".chapter-no").first().text().match(/\d+/)[0];

    for (let i = firstChapterNo; i <= totalChapters; i++) {
        const chapterName = "Chapter " + i;

        const releaseDate = null;

        const chapterUrl = "chapter-" + i;

        const chapter = { chapterName, releaseDate, chapterUrl };

        novelChapters.push(chapter);
    }

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}novel/${novelUrl}/${chapterUrl}`;

    const body = await scraper(url);

    $ = cheerio.load(body);

    const chapterName = $("h2").text();
    let chapterText = $("#chapter-container").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    if (!$("a.nextchap.isDisabled").length) {
        nextChapter = $("a.nextchap")
            .attr("href")
            .replace("/novel/" + novelUrl + "/", "");
    }

    let prevChapter = null;

    if (!$("a.prevchap.isDisabled").length) {
        prevChapter = $("a.prevchap")
            .attr("href")
            .replace("/novel/" + novelUrl + "/", "");
    }

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 15,
        novelUrl,
        chapterUrl,
        chapterName,
        chapterText,
        nextChapter,
        prevChapter,
    };

    res.json(chapter);
};

const searchScraper = async (req, res) => {
    const searchTerm = req.query.s;

    const url = `${baseUrl}lnwsearchlive?inputContent=${searchTerm}`;

    const result = await scraper(url);

    $ = cheerio.load(result);

    let novels = [];

    let results = JSON.parse($("body").text());

    $ = cheerio.load(results.resultview);

    $(".novel-item").each(function (result) {
        const novelName = $(this).find("h4.novel-title").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find("a").attr("href").replace(`/novel/`, "");
        novelUrl += "/";

        const novel = {
            extensionId: 15,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = lightNovelPubScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
