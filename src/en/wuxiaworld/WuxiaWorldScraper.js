const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const baseUrl = "https://www.wuxiaworld.com/";

const novelsScraper = async (req, res) => {
    const url = `${baseUrl}api/novels`;

    const result = await fetch(url);
    const data = await result.json();

    let novels = [];

    data.items.map((novel) => {
        let novelName = novel.name;
        let novelCover = novel.coverUrl;
        let novelUrl = novel.slug;
        novelUrl = novelUrl + "/";

        novels.push({
            extensionId: 7,
            novelUrl,
            novelName,
            novelCover,
        });
    });

    res.json(novels);
};

const novelScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    const url = `${baseUrl}novel/${novelUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 7;

    novel.sourceName = "WuxiaWorld";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $("h2").text();

    novel.novelCover = $("img.img-thumbnail").attr("src");

    novel.novelSummary = $(".fr-view > p").text();

    novel["Author(s)"] = $("div > dt")
        .filter(function () {
            return $(this).text().trim() === "Author:";
        })
        .next()
        .text();

    let genres = [];

    $(".genres")
        .find("div")
        .each(function (res) {
            genres.push($(this).find("a").text());
        });

    novel["Genre(s)"] = genres.join(",");

    novel["Artist(s)"] = null;

    novel.Status = null;

    let novelChapters = [];

    $(".chapter-item").each(function (result) {
        let chapterName = $(this).text();
        chapterName = chapterName.replace(/[\t\n]/g, "");

        const releaseDate = null;

        let chapterUrl = $(this).find("a").attr("href");
        chapterUrl = chapterUrl.replace(`/novel/${novelUrl}/`, "");

        const chapter = {
            chapterName,
            releaseDate,
            chapterUrl,
        };

        novelChapters.push(chapter);
    });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    let url = `${baseUrl}novel/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("#sidebar-toggler-container").next().text();
    chapterName = chapterName.replace(/[\t\n]/g, "");

    $("#chapter-content > script").remove();

    let chapterText = $("#chapter-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    if ($("li.next > a").attr("href") !== "#") {
        nextChapter = $("li.next > a")
            .attr("href")
            .replace(`/novel/${novelUrl}`, "");
    }

    let prevChapter = null;

    if ($("li.prev > a").attr("href") !== "#") {
        prevChapter = $("li.prev > a")
            .attr("href")
            .replace(`/novel/${novelUrl}`, "");
    }

    const chapter = {
        extensionId: 7,
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
    const searchUrl = `https://www.wuxiaworld.com/api/novels/search?query=`;

    const url = `${searchUrl}${searchTerm}`;

    const result = await fetch(url);
    const data = await result.json();

    let novels = [];

    data.items.map((novel) => {
        let novelName = novel.name;
        let novelCover = novel.coverUrl;
        let novelUrl = novel.slug;
        novelUrl = novelUrl + "/";

        novels.push({
            extensionId: 7,
            novelUrl,
            novelName,
            novelCover,
        });
    });

    res.json(novels);
};

module.exports = wuxiaWorldScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
