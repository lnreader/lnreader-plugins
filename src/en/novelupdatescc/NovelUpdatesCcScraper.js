const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://www.novelupdates.cc/";

const novelsScraper = async (req, res) => {
    const result = await fetch(baseUrl);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".section-item").each(function (result) {
        const novelName = $(this).find(".book-name").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find("a").attr("href").slice(1);

        const novel = {
            extensionId: 18,
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
    const url = `${baseUrl}${novelUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 18;

    novel.sourceName = "NovelUpdatesCc";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $(".book-name").text();

    novel.novelCover = $("div.book-img > img").attr("src");

    novel["Genre(s)"] = $("div.book-catalog > span.txt").text();

    novel.Status = $("div.book-state > span.txt").text();

    novel["Author(s)"] = $("div.author > span.name").text();

    novelSummary = $("div.content > p.desc").html();
    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    $(".chapter-item").each(function (result) {
        const chapterName = $(this).find(".chapter-name").text();
        const releaseDate = null;
        const chapterUrl = $(this).attr("href").slice(1);

        novelChapters.push({
            chapterName,
            releaseDate,
            chapterUrl,
        });
    });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    const chapterName = $("h1.chapter-title").text();
    let chapterText = $("div.chapter-entity").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    if ($("a.next").length) {
        nextChapter = $("a.next").attr("href").slice(1);
    }

    let prevChapter = null;

    if ($("a.prev").length) {
        prevChapter = $("a.prev").attr("href").slice(1);
    }

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 18,
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

    const url = `${baseUrl}search/${searchTerm}/1`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".list-item").each(function (result) {
        $(this).find("font").remove();

        const novelName = $(this).find(".book-name").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find("a").attr("href").slice(1);

        const novel = {
            extensionId: 18,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = wuxiaWorldCoScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
