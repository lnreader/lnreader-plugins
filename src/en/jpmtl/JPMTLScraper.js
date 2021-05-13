const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");

const baseUrl = "https://jpmtl.com/";

const novelsScraper = async (req, res) => {
    let url =
        "https://jpmtl.com/v2/book/show/browse?query=&categories=&content_type=0&direction=0&page=2&limit=20&type=5&status=all&language=3&exclude_categories=";

    const result = await fetch(url);
    const body = await result.json();

    let novels = [];

    body.map((item) => {
        const novelName = item.title;
        const novelCover = item.cover;
        const novelUrl = item.id + "/";

        const novel = { extensionId: 14, novelName, novelCover, novelUrl };

        novels.push(novel);
    });

    res.json(novels);
};

const novelScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    const url = `${baseUrl}books/${novelUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 14;

    novel.sourceName = "JPMTL";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $("h1.book-sidebar__title").text();

    novel.novelCover = $(".book-sidebar").find("img").attr("src");

    $(".post-content_item").each(function (result) {
        detailName = $(this)
            .find(".summary-heading > h5")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();
        detail = $(this)
            .find(".summary-content")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();

        novel[detailName] = detail;
    });

    novel.novelSummary = $(".main-book__synopsis").text();

    novel["Genre(s)"] = "";

    $("a.main-book__category").each(function (result) {
        novel["Genre(s)"] += $(this).text();
    });

    novel["Author(s)"] = $(".book-sidebar__author > .book-sidebar__info")
        .text()
        .replace(/[\t\n]/g, "")
        .trim();

    let novelChapters = [];

    const chapterListUrl = `https://jpmtl.com/v2/chapter/${novelUrl}/list?state=published&structured=true&d`;

    const chapterResult = await fetch(chapterListUrl);
    const volumes = await chapterResult.json();

    volumes.map((volume) => {
        volume.chapters.map((chapter) => {
            const chapterName = "Vol. " + volume.volume + " " + chapter.title;
            const releaseDate = chapter.created_at;
            const chapterUrl = chapter.id;

            const obj = {
                extensionId: 14,
                chapterName,
                releaseDate,
                chapterUrl,
            };

            novelChapters.push(obj);
        });
    });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}books/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    console.log(url);

    $ = cheerio.load(body);

    const chapterName = $(".chapter-content__title").text();
    let chapterText = $(".chapter-content__content").html();
    chapterText = htmlToText(chapterText);

    let nextChapter = null;
    let prevChapter = null;

    $(".chapter-wrapper__nav").each(function (result) {
        const chId = $(this)
            .attr("href")
            .replace("/books/" + novelUrl + "/", "");
        if (chId < chapterUrl) {
            prevChapter = chId;
        } else {
            nextChapter = chId;
        }
    });

    novelUrl += "/";

    const chapter = {
        extensionId: 14,
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

    const url = `https://jpmtl.com/v2/book/show/browse?query=${searchTerm}&categories=&content_type=2&direction=0&page=1&limit=20&type=5&status=all&language=3&exclude_categories=`;

    const result = await fetch(url);
    const body = await result.json();

    const novels = [];

    body.map((item) => {
        const novelName = item.title;
        const novelCover = item.cover;
        const novelUrl = item.id + "/";

        const novel = { extensionId: 14, novelName, novelCover, novelUrl };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = novelTrenchScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
