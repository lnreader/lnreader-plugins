const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "http://www.novelawuxia.com/";

function getNovelName(y) {
    return y.replace(/-/g, " ").replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

const novelsScraper = async (req, res) => {
    let url = baseUrl + "p/todas-las-novelas.html";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".post-body.entry-content")
        .find("a")
        .each(function (result) {
            let novelName = $(this)
                .attr("href")
                .split("/")
                .pop()
                .replace(".html", "");
            novelName = getNovelName(novelName);
            const novelCover = $(this).find("img").attr("src");

            let novelUrl = $(this).attr("href");
            novelUrl = novelUrl.replace(`${baseUrl}p/`, "") + "/";

            const novel = {
                extensionId: 31,
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
    const url = `${baseUrl}p/${novelUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 31;

    novel.sourceName = "Novela Wuxia";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $("h1.post-title").text().trim();

    novel.novelCover = $("div.separator").find("a").attr("href");

    novel["Artist(s)"] = "";
    novel.Status = "";

    $("div > b").each(function (result) {
        const detailName = $(this).text();
        let detail = $(this)[0].nextSibling;

        if (detailName && detail) {
            detail = detail.nodeValue;

            if (detailName.includes("Autor")) {
                novel["Author(s)"] = detail.replace("Autor:", "");
            }

            if (detailName.includes("Estatus")) {
                novel.Status = detail.replace("Estatus: ", "");
            }
            if (detailName.includes("Géneros:")) {
                novel["Genre(s)"] = detail
                    .replace("Géneros: ", "")
                    .replace(/,\s/g, ",");
            }
        }
    });

    let novelChapters = [];

    $("div").each(function (result) {
        const detailName = $(this).text();

        if (detailName.includes("Sinopsis")) {
            novel.novelSummary = $(this)
                .next()
                .text()
                .replace("Sinopsis", "")
                .trim();
        }

        if (detailName.includes("Lista de Capítulos")) {
            $(this)
                .find("a")
                .each(function (res) {
                    const chapterName = $(this).text();
                    let chapterUrl = $(this).attr("href");
                    const releaseDate = null;

                    if (
                        chapterName &&
                        chapterUrl &&
                        chapterUrl.includes(novelUrl.replace(".html", "")) &&
                        !novelChapters.some(
                            (chap) => chap.chapterName === chapterName
                        )
                    ) {
                        chapterUrl = chapterUrl.replace(baseUrl, "");

                        const chapter = {
                            chapterName,
                            releaseDate,
                            chapterUrl,
                        };

                        novelChapters.push(chapter);
                    }
                });
        }
    });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let year = req.params.year;
    let month = req.params.month;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}${year}/${month}/${chapterUrl}`;

    console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h1.post-title").text().trim();

    let chapterText = $(".post-body.entry-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    let prevChapter = null;

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 31,
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

    const url = `${baseUrl}search?q=${searchTerm}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".date-outer").each(function (result) {
        let novelName = $(this)
            .find("a")
            .attr("href")
            .split("/")
            .pop()
            .replace(/-capitulo(.*?).html/, "");

        const novelUrl = novelName + ".html/";

        novelName = getNovelName(novelName);

        const exists = novels.some((novel) => novel.novelName === novelName);

        if (!exists) {
            const novelCover = null;
            const novel = {
                extensionId: 31,
                novelName,
                novelCover,
                novelUrl,
            };

            novels.push(novel);
        }
    });

    res.json(novels);
};

module.exports = vipNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
