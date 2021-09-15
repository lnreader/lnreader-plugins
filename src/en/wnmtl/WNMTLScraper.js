const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://www.wnmtl.org/";

const sourceName = "WNMTL";
const sourceId = 77;

const novelsScraper = async (req, res) => {
    let url = baseUrl + "explore";

    console.log(url);

    const result = await fetch(
        "https://www.wnmtl.org/book/2308-warlock-apprentice"
    );
    const body = await result.text();

    // $ = cheerio.load(body);

    // let novels = [];

    // $(".card").each(function () {
    //     const novelName = $(this).find(".book-name").text();
    //     const novelCover = $(this).find("img").attr("src");
    //     const novelUrl = $(this).find("a").attr("href");

    //     const novel = {
    //         sourceId,
    //         novelName,
    //         novelCover,
    //         novelUrl,
    //     };

    //     novels.push(novel);
    // });

    res.json({ novels: body });
};

const novelScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    const url = novelUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = { sourceId, sourceName, url, novelUrl };

    novel.novelName = $("#thumbnail > img").text();

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

    let chapterUrlPrefix = $("tbody > tr")
        .first()
        .next()
        .find("td > a")
        .text()
        .split(" ");

    chapterUrlPrefix.pop();

    chapterUrlPrefix = chapterUrlPrefix.join("-").toLowerCase();

    const latestChapter = $("tbody > tr")
        .first()
        .next()
        .find("td > a")
        .text()
        .replace(/^\D+/g, "");

    for (let i = 1; i <= latestChapter; i++) {
        const chapterName = "Chapter " + i;
        const releaseDate = null;
        const chapterUrl = chapterUrlPrefix + "-" + i + "/";

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
            sourceId,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = WNMTLScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
