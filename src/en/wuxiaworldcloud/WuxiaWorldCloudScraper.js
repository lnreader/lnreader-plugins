const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const baseUrl = "http://wuxiaworld.cloud/";

const novelsScraper = async (req, res) => {
    const url = `${baseUrl}/popular-novel`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.col-novel-main > div.list-novel > .row").each(function (result) {
        let novelUrl = $(this)
            .find("h3.novel-title > a")
            .attr("href")
            .replace(baseUrl + "novel/", "");
        novelUrl = `${novelUrl}/`;

        const novelName = $(this).find("h3.novel-title > a").text();
        const novelCover = $(this).find("img").attr("src");

        const novel = {
            extensionId: 20,
            novelUrl,
            novelName,
            novelCover,
        };

        novels.push(novel);
    });

    res.json(novels);
};

const novelScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    const url = `${baseUrl}novel/${novelUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 20;

    novel.sourceName = "WuxiaWorld.cloud";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("div.book > img").attr("alt");

    novel.novelCover = $("div.book > img").attr("src");

    novel.novelSummary = $("div.desc-text").text();

    novel["Author(s)"] = $("div.info > div > h3")
        .filter(function () {
            return $(this).text().trim() === "Author:";
        })
        .siblings()
        .text();

    novel["Genre(s)"] = $("div.info > div")
        .filter(function () {
            return $(this).find("h3").text().trim() === "Genre:";
        })
        .text()
        .replace("Genre:", "")
        .replace(/\s/g, "");

    novel["Artist(s)"] = null;

    novel.Status = $("li > h3")
        .filter(function () {
            return $(this).text().trim() === "Status:";
        })
        .siblings()
        .text();

    const novelId = $("#rating").attr("data-novel-id");

    const getChapters = async (novelId) => {
        const chapterListUrl =
            baseUrl + "ajax/chapter-option?novelId=" + novelId;

        const data = await fetch(chapterListUrl);
        const chapters = await data.text();

        $ = cheerio.load(chapters);

        let novelChapters = [];

        $("select > option").each(function (result) {
            let chapterName = $(this).text();
            let releaseDate = null;
            let chapterUrl = $(this).attr("value");
            chapterUrl = chapterUrl.replace(baseUrl, "");

            novelChapters.push({
                chapterName,
                releaseDate,
                chapterUrl,
            });
        });
        return novelChapters;
    };

    novel.novelChapters = await getChapters(novelId);

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    chapterUrl = encodeURI(chapterUrl);

    const url = `${baseUrl}${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    const chapterName = $(".chr-title").attr("title");
    let chapterText = $("#chr-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    if ($("a#next_chap").attr("href")) {
        nextChapter = $("a#next_chap").attr("href").replace(baseUrl, "");
    }

    let prevChapter = null;
    if ($("a#prev_chap").attr("href")) {
        prevChapter = $("a#prev_chap").attr("href").replace(baseUrl, "");
    }

    const chapter = {
        extensionId: 20,
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
    const searchUrl = `http://wuxiaworld.cloud/search?keyword=`;

    const url = `${searchUrl}${searchTerm}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.col-novel-main > div.list-novel > .row").each(function (result) {
        let novelUrl = $(this)
            .find("h3.novel-title > a")
            .attr("href")
            .replace(baseUrl + "novel/", "");
        novelUrl = `${novelUrl}/`;

        const novelName = $(this).find("h3.novel-title > a").text();
        const novelCover = $(this).find("img").attr("src");

        const novel = {
            extensionId: 20,
            novelUrl,
            novelName,
            novelCover,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = readNovelFullScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
