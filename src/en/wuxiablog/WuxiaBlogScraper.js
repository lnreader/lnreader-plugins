const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const extensionId = 48;

const sourceName = "Wuxia.Blog";

const baseUrl = "https://www.wuxia.blog/";

const novelsScraper = async (req, res) => {
    let url = `${baseUrl}/listNovels`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.panel-body > table")
        .find("tr")
        .each(function () {
            const novelName = $(this).find("td.novel").text();

            if (novelName) {
                const novelId = $(this).find("td:nth-child(1)").text();

                const novelCover = baseUrl + "/data/image/" + novelId + ".jpg";

                let novelUrl = $(this)
                    .find("td.novel > a")
                    .attr("href")
                    .replace("/novel/", "");

                const novel = {
                    extensionId,
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

    const url = `${baseUrl}novel/${novelUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {
        extensionId,
        sourceName,
        sourceUrl: url,
        novelUrl,
    };

    novel.novelName = $(
        "body > div.container-fluid.text-center > div.row.content > div.col-sm-8.text-left > div:nth-child(6) > div.panel-heading.clearfix > h4"
    ).text();

    novel.novelCover = $('img[itemprop="image"]').attr("src");

    novel["Author(s)"] = $(
        "div.col-md-6 > div > div:nth-child(2) > div > div:nth-child(2) > a"
    ).text();

    novel["Genre(s)"] = $(
        "div.row > div.col-md-6 > div > a:nth-child(4)"
    ).text();

    novel.novelSummary = $('div[itemprop="description"]')
        .find("p")
        .text()
        .trim();

    let novelChapters = [];

    $("table#chplist > #chapters > tr").each(function () {
        const chapterName = $(this).find("a").text();

        const releaseDate = $(this)
            .find("td:nth-child(2)")
            .text()
            .replace(/-/g, "/");

        const chapterUrl = $(this).find("a").attr("href").replace(url, "");

        const chapter = {
            chapterName,
            releaseDate,
            chapterUrl,
        };

        novelChapters.push(chapter);
    });

    let moreChaptersUrl =
        baseUrl +
        "temphtml/_tempChapterList_all_" +
        $("div#more").attr("data-nid") +
        ".html";

    let moreChapters = await fetch(moreChaptersUrl);
    let moreChaptersString = await moreChapters.text();

    $ = cheerio.load(moreChaptersString);

    $("a").each(function () {
        const chapterName = $(this).text();

        const releaseDate = $(this)[0]
            .nextSibling.nodeValue.replace(/-/g, "/")
            .trim();

        const chapterUrl = $(this).attr("href").replace(url, "");

        const chapter = {
            chapterName,
            releaseDate,
            chapterUrl,
        };

        novelChapters.push(chapter);
    });

    novel.novelChapters = novelChapters.reverse();

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterId = req.params.chapterId;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}novel/${novelUrl}/${chapterId}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("div.panel-body.article").find("h4").text();

    $("ul.pager").remove();

    let chapterText = $("div.panel-body.article")
        .html()
        .replace(/<span(.*?)>(.*?)<\/span>/g, "");

    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    let prevChapter = null;

    const chapter = {
        extensionId,
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

    const url = `${baseUrl}?search=${searchTerm}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("#table")
        .find("tr")
        .each(function () {
            const novelName = $(this).find("a").text().trim();

            if (novelName) {
                const novelCover = $(this).find("img").attr("src");

                let novelUrl = $(this)
                    .find("a")
                    .attr("href")
                    .replace(baseUrl + "novel/", "");

                const novel = {
                    extensionId,
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
