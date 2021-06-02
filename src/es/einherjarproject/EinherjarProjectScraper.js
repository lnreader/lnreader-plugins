const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://einherjarproject.net/";

const novelsScraper = async (req, res) => {
    let url = baseUrl + "proyectos-activos/";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".wp-block-media-text").each(function (result) {
        const novelName = $(this).find("a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this)
            .find(".wp-block-media-text__content")
            .find("a")
            .attr("href");
        novelUrl = novelUrl.replace(baseUrl, "");

        const novel = {
            extensionId: 25,
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
    const url = baseUrl + novelUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 25;

    novel.sourceName = "Einherjar Project";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("h1").text();

    novel.novelCover = $("img").attr("src");

    $(".wp-block-columns")
        .find("li")
        .each(function (result) {
            if ($(this).text().includes("Autor:")) {
                novel["Author(s)"] = $(this)
                    .text()
                    .replace("Autor:", "")
                    .slice(0, -1);
            }
            if ($(this).text().includes("Ilustrador: ")) {
                novel["Artist(s)"] = $(this)
                    .text()
                    .replace("Ilustrador: ", "")
                    .slice(0, -1);
            }
            if ($(this).text().includes("Estado: ")) {
                novel.Status = $(this)
                    .text()
                    .replace("Estado: ", "")
                    .slice(0, -1);
            }
        });

    novel["Genre(s)"] = $(".post-content > h6")
        .text()
        .replace(/GÉNEROS: /, "")
        .replace(/,\s/g, ",");

    let novelSummary = $(".post-content > .has-text-align-center").html();

    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    $(".wp-block-media-text")
        .find("p")
        .each(function (result) {
            if ($(this).find("a").text()) {
                const chapterName = $(this).text();
                const releaseDate = null;
                let chapterUrl = $(this)
                    .find("a")
                    .attr("href")
                    .replace(baseUrl, "");
                if (chapterUrl.includes(novelUrl + "/"))
                    chapterUrl = chapterUrl.replace(novelUrl + "/", "");

                const chapter = { chapterName, releaseDate, chapterUrl };

                novelChapters.push(chapter);
            }
        });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = baseUrl + chapterUrl;
    console.log(url);
    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h1.post-title").text();

    let chapterText = $(".post-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    let prevChapter = null;

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 25,
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

    const url = baseUrl + "?s=" + searchTerm;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".post-container")
        .find("div.type-page")
        .each(function (result) {
            const novelName = $(this)
                .find(".post-header")
                .text()
                .replace(/\n/g, "");
            if (
                !novelName.includes("EPUBs") &&
                !novelName.includes("Proyectos Activos") &&
                !novelName.includes("Chapter")
            ) {
                const novelCover = $(this).find("img").attr("src");

                let novelUrl = $(this)
                    .find("a")
                    .attr("href")
                    .replace(baseUrl, "");

                const novel = {
                    extensionId: 25,
                    novelName,
                    novelCover,
                    novelUrl,
                };

                novels.push(novel);
            }
        });

    res.json(novels);
};

module.exports = einharjarProjectScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
