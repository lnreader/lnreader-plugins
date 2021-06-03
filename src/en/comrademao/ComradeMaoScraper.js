const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://comrademao.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("article.blog-article").each(function (result) {
        const novelName = $(this).find("h5 > a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find("h5 > a").attr("href");
        novelUrl = novelUrl.replace(baseUrl + "novel/", "");

        const novel = {
            extensionId: 27,
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
    const url = baseUrl + "novel/" + novelUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 27;

    novel.sourceName = "Comrade Mao";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    function getNovelName(y) {
        return y
            .replace("-", " ")
            .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
    }

    novelName = getNovelName(novelUrl);
    novel.novelName = novelName;

    novel.novelCover = $("#thumbnail > img").attr("src");

    let novelSummary = $("div#Description").html();
    novel.novelSummary = htmlToText(novelSummary);

    novel["Genre(s)"] = $("div#Genre")
        .text()
        .replace(/Genre:|\s/g, "");

    novel.Status = $("div#Status")
        .text()
        .replace(/Status:|\s/g, "");

    novel["Author(s)"] = $("div#Publisher")
        .text()
        .replace(/Publisher:|\s/g, "");

    // novel['Genre(s)'] = $("div#Genre").

    let novelChapters = [];

    const latestChapter = $("tbody > tr")
        .first()
        .next()
        .find("td > a")
        .text()
        .replace(/^\D+/g, "");

    for (let i = 1; i <= latestChapter; i++) {
        const chapterName = "Chapter " + i;
        const releaseDate = null;
        const chapterUrl = novelUrl + "-chapter-" + i + "/";

        const chapter = {
            chapterName,
            releaseDate,
            chapterUrl,
        };

        novelChapters.push(chapter);
    }

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}mtl/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $(".entry-title").text();

    let chapterText = $(".entry-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    if ($(".nav-next").find("a").length) {
        nextChapter = $(".nav-next")
            .find("a")
            .attr("href")
            .replace(baseUrl + "mtl/" + novelUrl + "/", "");
    }

    let prevChapter = null;

    if ($(".nav-previous").find("a").length) {
        prevChapter = $(".nav-previous")
            .find("a")
            .attr("href")
            .replace(baseUrl + "mtl/" + novelUrl + "/", "");
    }

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 27,
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

    const url = baseUrl + "?s=" + searchTerm + "&post_type=novel";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("article.blog-article").each(function (result) {
        const novelName = $(this).find("h5 > a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find("h5 > a").attr("href");
        novelUrl = novelUrl.replace(baseUrl + "novel/", "");

        const novel = {
            extensionId: 27,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = vipNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
