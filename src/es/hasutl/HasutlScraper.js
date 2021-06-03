const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://hasutl.wordpress.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl + "light-novels-activas/";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.wp-block-columns").each(function (result) {
        const novelName = $(this).find(".wp-block-button").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find(".wp-block-button > a").attr("href");
        novelUrl = novelUrl.replace(baseUrl, "");

        const novel = {
            extensionId: 29,
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
    const url = `${baseUrl}/${novelUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 29;

    novel.sourceName = "Hasu Translations";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $(".post-header").text();

    novel.novelCover = $(".summary_image > a > img").attr("src");

    let details = $(".post-content").find("p").html();

    detailName = details.match(/<strong>(.|\n)*?<\/strong>/g);
    details = details.match(/<\/strong>(.|\n)*?<br>/g);
    details = details.map((detail) => detail.replace(/<\/strong>|<br>/g, ""));

    novel["Genre(s)"] = "";

    detailName.map((detail, index) => {
        if (detail.includes("Autor")) {
            novel["Author(s)"] = details[index];
        }
        if (detail.includes("Géneros")) {
            novel["Genre(s)"] = details[index].replace(/\s/g, "");
        }
        if (detail.includes("Artista")) {
            novel["Artist(s)"] = details[index];
        }
    });

    let novelSummary = $(".post-content").find("p").html();
    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    $(".wp-block-media-text__content")
        .find("a")
        .each(function (result) {
            const chapterName = $(this).text().trim();

            const releaseDate = null;

            let chapterUrl = $(this).attr("href").split("/");
            chapterUrl = chapterUrl[chapterUrl.length - 2];

            const chapter = { chapterName, releaseDate, chapterUrl };

            novelChapters.push(chapter);
        });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $(".post-title").text();

    let chapterText = $(".post-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    // if ($(".nav-next").length) {
    //     nextChapter = $(".nav-next")
    //         .find("a")
    //         .attr("href")
    //         .replace(baseUrl + "vipnovel/" + novelUrl + "/", "");
    // }

    let prevChapter = null;

    // if ($(".nav-previous").length) {
    //     prevChapter = $(".nav-previous")
    //         .find("a")
    //         .attr("href")
    //         .replace(baseUrl + "vipnovel/" + novelUrl + "/", "");
    // }

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl;

    const chapter = {
        extensionId: 29,
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

    const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".post-container ").each(function (result) {
        const novelName = $(this).find(".post-header").text();
        if (
            !novelName.includes("Cap") &&
            !novelName.includes("Vol") &&
            !novelName.includes("Light Novels")
        ) {
            const novelCover = $(this).find("img").attr("src");

            let novelUrl = $(this).find("a").attr("href");
            novelUrl = novelUrl.replace(baseUrl, "");

            const novel = {
                extensionId: 29,
                novelName,
                novelCover,
                novelUrl,
            };

            novels.push(novel);
        }
    });

    res.json(novels);
};

module.exports = HasutlScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
