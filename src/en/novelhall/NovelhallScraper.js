const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const baseUrl = "https://www.novelhall.com/";

const novelsScraper = async (req, res) => {
    const result = await fetch(baseUrl);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.section1")
        .find("li")
        .each(function (result) {
            const novelName = $(this).find(".book-info > h2 > a").text();
            const novelCover = $(this).find("img").attr("src");
            const novelUrl = $(this).find("a").attr("href").substring(1);

            const novel = {
                extensionId: 6,
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

    novel.extensionId = 6;

    novel.sourceName = "NovelHall";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $("h1").text();

    novel.novelCover = $("div.book-img > img").attr("src");

    novel.novelSummary = $("div.intro")
        .text()
        .replace(/[\t\n]/g, "");

    novel["Author(s)"] = $("span.blue").first().text().replace("Author：", "");

    novel["Genre(s)"] = $("a.red").text();

    novel["Artist(s)"] = null;

    novel.Status = $("span.blue").first().next().text().replace("Status：", "");

    let novelChapters = [];

    $("div.book-catalog.hidden-xs#morelist")
        .find("li.post-11")
        .each(function (result) {
            let chapterName = $(this).find("a").text();

            let releaseDate = null;

            let chapterUrl = $(this).find("a").attr("href");

            if (chapterUrl) {
                chapterUrl = chapterUrl.replace(`/${novelUrl}/`, "");
            }

            const chapter = {
                chapterName,
                releaseDate,
                chapterUrl,
            };

            novelChapters.push(chapter);
        });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl.replace(".html/", "");
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    const chapterName = $("h1").text();
    let chapterText = $("div.entry-content").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    nextChapter = $('a[rel="next"]').attr("href");
    if (nextChapter) {
        nextChapter = nextChapter.replace(`/${req.params.novelUrl}/`, "");
    }

    let prevChapter = null;
    prevChapter = $('a[rel="prev"]').attr("href");
    if (prevChapter) {
        prevChapter = prevChapter.replace(`/${req.params.novelUrl}/`, "");
    }

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    chapter = {
        extensionId: 6,
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
    const searchUrl = `${baseUrl}index.php?s=so&module=book&keyword=`;

    const url = `${searchUrl}${searchTerm}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("tr").each(function (result) {
        let novelName = $(this).find("td:nth-child(2)").text();
        novelName = novelName.replace(/[\t\n]/g, "");

        const novelCover = "https://cdn.novelupdates.com/imgmid/noimagemid.jpg";

        let novelUrl = $(this).find("td:nth-child(2) >").attr("href");
        if (novelUrl) {
            novelUrl = novelUrl.slice(1);
        }

        novel = {
            extensionId: 6,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = novelhallScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
