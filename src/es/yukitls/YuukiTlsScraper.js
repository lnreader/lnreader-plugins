const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://yuukitls.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".menu-item-2869")
        .find(".menu-item.menu-item-type-post_type.menu-item-object-post")
        .each(function (result) {
            const novelName = $(this).text();
            const novelCover = $(this).find("img").attr("src");

            let novelUrl = $(this).find("a").attr("href");
            novelUrl = novelUrl.split("/");
            novelUrl = novelUrl[novelUrl.length - 2] + "/";

            const novel = {
                extensionId: 28,
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

    novel.extensionId = 28;

    novel.sourceName = "YuukiTls";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("h1.entry-title")
        .text()
        .replace(/[\t\n]/g, "")
        .trim();

    novel.novelCover = $(".entry-content > div > img").attr("src");

    $(".entry-content")
        .find("div")
        .each(function (result) {
            if ($(this).text().includes("Escritor:")) {
                novel["Author(s)"] = $(this)
                    .text()
                    .replace("Escritor: ", "")
                    .trim();
            }
            if ($(this).text().includes("Ilustrador:")) {
                novel["Artist(s)"] = $(this)
                    .text()
                    .replace("Ilustrador: ", "")
                    .trim();
            }

            if ($(this).text().includes("Género:")) {
                novel["Genre(s)"] = $(this)
                    .text()
                    .replace(/Género: |\s/g, "");
            }

            if ($(this).text().includes("Sinopsis:")) {
                novel.novelSummary = $(this).next().text();
            }
        });

    let novelChapters = [];

    $(".entry-content")
        .find("li")
        .each(function (result) {
            let chapterUrl = $(this).find("a").attr("href");

            if (chapterUrl && chapterUrl.includes(baseUrl)) {
                const chapterName = $(this).text();
                const releaseDate = null;

                chapterUrl = chapterUrl.split("/");
                chapterUrl = chapterUrl[chapterUrl.length - 2] + "/";

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

    const url = `${baseUrl}/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h3").text();

    let chapterText = $(".entry-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    let prevChapter = null;

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 28,
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

    $(".menu-item-2869")
        .find(".menu-item.menu-item-type-post_type.menu-item-object-post")
        .each(function (result) {
            const novelName = $(this).text();
            const novelCover = $(this).find("img").attr("src");

            let novelUrl = $(this).find("a").attr("href");
            novelUrl = novelUrl.split("/");
            novelUrl = novelUrl[novelUrl.length - 2] + "/";

            const novel = {
                extensionId: 28,
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

module.exports = vipNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
