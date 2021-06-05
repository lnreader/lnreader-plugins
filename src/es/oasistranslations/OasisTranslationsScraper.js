const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://oasistranslations.wordpress.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".menu-item-1819")
        .find(".sub-menu > li")
        .each(function (result) {
            const novelName = $(this).text();
            if (!novelName.match(/Activas|Finalizadas|Dropeadas/)) {
                const novelCover = $(this).find("img").attr("src");

                let novelUrl = $(this).find("a").attr("href");
                novelUrl = novelUrl.split("/");
                novelUrl = novelUrl[novelUrl.length - 2] + "/";

                const novel = {
                    extensionId: 30,
                    novelName,
                    novelCover,
                    novelUrl,
                };

                novels.push(novel);
            }
        });

    res.json(novels);
};

const novelScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    const url = baseUrl + novelUrl + "/";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 30;

    novel.sourceName = "Oasis Translations";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("h1.entry-title")
        .text()
        .replace(/[\t\n]/g, "")
        .trim();

    novel.novelCover = $('img[loading="lazy"]').attr("src");

    let details = $(".entry-content").find("h2").next().html();

    details = details.match(/<\/strong>(.|\n)*?<br>/g);
    details = details.map((detail) =>
        detail.replace(/<strong>|<\/strong>|<br>|:\s/g, "")
    );

    novel["Genre(s)"] = "";

    novel["Author(s)"] = details[2];
    novel["Genre(s)"] = details[4].replace(/\s/g, "");
    novel["Artist(s)"] = details[3];

    let novelSummary = $(".entry-content").find("h2").next().next().html();
    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    // if ($(".entry-content").find("li").length) {
    $(".entry-content")
        .find("a")
        .each(function (result) {
            let chapterUrl = $(this).attr("href");

            if (chapterUrl && chapterUrl.includes(baseUrl)) {
                const chapterName = $(this).text();
                const releaseDate = null;

                chapterUrl = chapterUrl.split("/");
                chapterUrl = chapterUrl[chapterUrl.length - 2] + "/";

                const chapter = { chapterName, releaseDate, chapterUrl };

                novelChapters.push(chapter);
            }
        });
    // } else {
    //     $(".entry-content")
    //         .find("p")
    //         .each(function (result) {
    //             let chapterUrl = $(this).find("a").attr("href");

    //             if (chapterUrl && chapterUrl.includes(baseUrl)) {
    //                 const chapterName = $(this).text();
    //                 const releaseDate = null;

    //                 chapterUrl = chapterUrl.split("/");
    //                 chapterUrl = chapterUrl[chapterUrl.length - 2] + "/";

    //                 const chapter = { chapterName, releaseDate, chapterUrl };

    //                 novelChapters.push(chapter);
    //             }
    //         });
    // }

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

    let chapterName = $("h1.entry-title").text();

    $("div#jp-post-flair").remove();

    let chapterText = $(".entry-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    let prevChapter = null;

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 30,
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
    let searchTerm = req.query.s;
    searchTerm = searchTerm.toLowerCase();

    let url = baseUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];
    $(".menu-item-1819")
        .find(".sub-menu > li")
        .each(function (result) {
            const novelName = $(this).text();
            if (!novelName.match(/Activas|Finalizadas|Dropeadas/)) {
                const novelCover = $(this).find("img").attr("src");

                let novelUrl = $(this).find("a").attr("href");
                novelUrl = novelUrl.split("/");
                novelUrl = novelUrl[novelUrl.length - 2] + "/";

                const novel = {
                    extensionId: 30,
                    novelName,
                    novelCover,
                    novelUrl,
                };

                novels.push(novel);
            }
        });

    novels = novels.filter((novel) =>
        novel.novelName.toLowerCase().includes(searchTerm)
    );

    res.json(novels);
};

module.exports = vipNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
