const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const baseUrl = "https://readnovelfull.com";

const novelsScraper = async (req, res) => {
    const url = `${baseUrl}/most-popular-novel`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.col-novel-main > div.list-novel > .row").each(function (result) {
        let novelUrl = $(this)
            .find("h3.novel-title > a")
            .attr("href")
            .replace(".html", "")
            .substring(1);
        novelUrl = `${novelUrl}/`;

        const novelName = $(this).find("h3.novel-title > a").text();
        const novelCover = $(this).find("img").attr("src");

        const novel = {
            extensionId: 4,
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

    novel.extensionId = 4;

    novel.sourceName = "ReadNovelFull";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("div.book > img").attr("alt");

    novel.novelCover = $("div.book > img").attr("src");

    novel.novelSummary = $("div.desc-text").text();

    novel["Author(s)"] = $("li > h3")
        .filter(function () {
            return $(this).text().trim() === "Author:";
        })
        .siblings()
        .text();

    novel["Genre(s)"] = $("li")
        .filter(function () {
            return $(this).find("h3").text().trim() === "Genre:";
        })
        .text()
        .replace("Genre:", "");

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
            "https://readnovelfull.com/ajax/chapter-archive?novelId=" + novelId;

        const data = await fetch(chapterListUrl);
        const chapters = await data.text();

        $ = cheerio.load(chapters);

        let novelChapters = [];

        $(".panel-body")
            .find("li")
            .each(function (result) {
                let chapterName = $(this).find("a").attr("title");
                let releaseDate = null;
                let chapterUrl = $(this).find("a").attr("href");
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
    let novelUrl = req.params.novelUrl.replace(".html/", "");
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    const chapterName = $(".chr-title").attr("title");
    let chapterText = $("#chr-content").html();
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
        extensionId: 4,
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
    const searchUrl = `https://readnovelfull.com/search?keyword=`;

    const url = `${searchUrl}${searchTerm}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.col-novel-main > div.list-novel > .row").each(function (result) {
        let novelUrl = $(this)
            .find("h3.novel-title > a")
            .attr("href")
            .replace(".html", "")
            .substring(1);
        novelUrl = `${novelUrl}/`;

        const novelName = $(this).find("h3.novel-title > a").text();
        const novelCover = $(this).find("img").attr("src");

        const novel = {
            extensionId: 4,
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
