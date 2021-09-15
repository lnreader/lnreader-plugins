const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://noveldeglace.com/";

const sourceName = "Novel De Glace";
const sourceId = 76;

const novelsScraper = async (req, res) => {
    let url = baseUrl + "roman";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("article").each(function () {
        const novelName = $(this).find("h2").text().trim();
        const novelCover = $(this).find("img").attr("src");
        const novelUrl = $(this).find("h2 > a").attr("href").split("/")[4];

        const novel = {
            sourceId,
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
    const url = baseUrl + "roman/" + novelUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = { sourceId, sourceName, url, novelUrl };

    novel.novelName = $(
        "div.entry-content > div > strong"
    )[0].nextSibling.nodeValue.trim();

    novel.novelCover = $("#thumbnail > img").attr("src");

    novel.novelSummary = $("div[data-title=Synopsis]").text();
    novel.author = $(
        "div.romans > div.project-large > div.su-row > div.su-column.su-column-size-3-4 > div > div:nth-child(3) > strong"
    )[0].nextSibling.nodeValue.trim();

    novel.genre = $(".genre")
        .text()
        .replace("Genre : ", "")
        .replace(/, /g, ",");

    let novelChapters = [];

    $(".chpt").each(function () {
        const chapterName = $(this).find("a").text().trim();
        const releaseDate = null;
        const chapterUrl = $(this).find("a").attr("href").split("/")[4];

        const novel = {
            sourceId,
            chapterName,
            releaseDate,
            chapterUrl,
        };

        novelChapters.push(novel);
    });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}chapitre/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h2.western").text();

    let chapterText = $(".chapter-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    let prevChapter = null;

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        sourceId,
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

    let url = baseUrl + "roman";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("article").each(function () {
        const novelName = $(this).find("h2").text().trim();
        const novelCover = $(this).find("img").attr("src");
        const novelUrl = $(this).find("h2 > a").attr("href").split("/")[4];

        const novel = {
            sourceId,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    novels = novels.filter((novel) =>
        novel.novelName.toLowerCase().includes(searchTerm)
    );

    res.json(novels);
};

module.exports = NovelDeGlaceScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
