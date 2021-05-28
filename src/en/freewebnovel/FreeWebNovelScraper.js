const cheerio = require("cheerio");
const fetch = require("node-fetch");
const request = require("request");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://freewebnovel.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl + "most-popular-novel/";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".li-row").each(function (result) {
        const novelName = $(this).find(".tit").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this)
            .find("h3 > a")
            .attr("href")
            .replace(".html", "")
            .slice(1);

        novelUrl += "/";

        const novel = {
            extensionId: 13,
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
    const url = `${baseUrl}${novelUrl}.html`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 13;

    novel.sourceName = "FreeWebNovel";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl.replace(".html", "")}/`;

    novel.novelName = $("h1.tit").text();

    novel.novelCover = $(".pic > img").attr("src");

    novel["Genre(s)"] = $("[title=Genre]")
        .next()
        .text()
        .replace(/[\t\n]/g, "");

    novel["Author(s)"] = $("[title=Author]")
        .next()
        .text()
        .replace(/[\t\n]/g, "");

    novel["Artist(s)"] = null;

    novel.Status = $("[title=Status]")
        .next()
        .text()
        .replace(/[\t\n]/g, "");

    novel.Alternative = $("[title='Alternative names']")
        .next()
        .text()
        .replace(/[\t\n]/g, "");

    let novelSummary = $(".inner").html();
    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    let latestChapter;

    $("h3.tit").each(function (res) {
        if ($(this).find("a").text() === novel.novelName) {
            // console.log($(this).find("a").text());
            // console.log(novel.novelName);
            latestChapter = $(this).next().find("span.s3").text().match(/\d+/);
        }
    });

    latestChapter = latestChapter[0];

    for (let i = 1; i <= parseInt(latestChapter); i++) {
        const chapterName = "Chapter " + i;

        const releaseDate = null;

        const chapterUrl = "chapter-" + i;

        const chapter = { chapterName, releaseDate, chapterUrl };

        novelChapters.push(chapter);
    }

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}${novelUrl}/${chapterUrl}.html`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h1.tit").text();

    let chapterText = $("div.txt").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    if ($("[title='Read Next chapter']").length) {
        nextChapter = $("[title='Read Next chapter']")
            .attr("href")
            .replace("/" + novelUrl + "/", "")
            .replace(".html", "");
    }

    let prevChapter = null;

    if ($("[title='Read Privious Chapter']").length) {
        prevChapter = $("[title='Read Privious Chapter']")
            .attr("href")
            .replace("/" + novelUrl + "/", "")
            .replace(".html", "");
    }
    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl;

    const chapter = {
        extensionId: 13,
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

    const url = baseUrl + "search/";

    request.post(
        { url, form: { searchkey: searchTerm } },
        (err, response, body) => {
            $ = cheerio.load(body);

            let novels = [];

            $(".li-row > .li > .con").each(function (result) {
                const novelName = $(this).find(".tit").text();
                const novelCover = $(this)
                    .find(".pic > a > img")
                    .attr("data-cfsrc");

                let novelUrl = $(this)
                    .find("h3 > a")
                    .attr("href")
                    .replace(".html", "")
                    .slice(1);

                novelUrl += "/";

                const novel = {
                    extensionId: 13,
                    novelName,
                    novelCover,
                    novelUrl,
                };

                novels.push(novel);
            });

            res.json(novels);
        }
    );
};

module.exports = vipNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
