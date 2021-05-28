const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const baseUrl = "https://novelfull.com";

const novelsScraper = async (req, res) => {
    const url = `${baseUrl}/most-popular`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.col-truyen-main > div.list-truyen > .row").each(function (result) {
        const novelName = $(this).find("h3.truyen-title > a").text();

        let novelCover = $(this).find("img").attr("src");
        novelCover = baseUrl + novelCover;

        let novelUrl = $(this)
            .find("h3.truyen-title > a")
            .attr("href")
            .replace(".html", "")
            .substring(1);
        novelUrl = `${novelUrl}/`;

        const novel = {
            extensionId: 8,
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
    const url = `${baseUrl}/${novelUrl}.html`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 8;

    novel.sourceName = "NovelFull";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $("div.book > img").attr("alt");

    novel.novelCover = baseUrl + $("div.book > img").attr("src");

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
        .replace("Genre:", "");

    novel["Artist(s)"] = null;

    novel.Status = $("div.info > div > h3")
        .filter(function () {
            return $(this).text().trim() === "Status:";
        })
        .next()
        .text();

    const novelId = $("#rating").attr("data-novel-id");

    const getChapters = async (novelId) => {
        const chapterListUrl =
            baseUrl + "/ajax/chapter-option?novelId=" + novelId;

        const data = await fetch(chapterListUrl);
        const chapters = await data.text();

        $ = cheerio.load(chapters);

        let novelChapters = [];

        $("select > option").each(function (result) {
            let chapterName = $(this).text();
            let releaseDate = null;
            let chapterUrl = $(this).attr("value");
            chapterUrl = chapterUrl.replace(`/${novelUrl}/`, "");

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
    const novelUrl = req.params.novelUrl.replace(".html/", "");
    const chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    const chapterName = $(".chapter-title").attr("title");
    let chapterText = $("#chapter-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    if ($("a#next_chap").attr("href")) {
        nextChapter = $("a#next_chap")
            .attr("href")
            .replace(`/${novelUrl}/`, "");
    }

    let prevChapter = null;
    if ($("a#prev_chap").attr("href")) {
        prevChapter = $("a#prev_chap")
            .attr("href")
            .replace(`/${novelUrl}/`, "");
    }

    const chapter = {
        extensionId: 8,
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
    const searchUrl = `https://novelfull.com/search?keyword=`;

    const url = `${searchUrl}${searchTerm}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.col-truyen-main > div.list-truyen > .row").each(function (result) {
        let novelUrl = $(this)
            .find("h3.truyen-title > a")
            .attr("href")
            .replace(".html", "")
            .substring(1);
        novelUrl = `${novelUrl}/`;

        const novelName = $(this).find("h3.truyen-title > a").text();
        const novelCover = $(this).find("img").attr("src");

        const novel = {
            extensionId: 8,
            novelUrl,
            novelName,
            novelCover,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = novelFullScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
