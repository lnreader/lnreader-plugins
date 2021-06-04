const cheerio = require("cheerio");
const fetch = require("node-fetch");
const UserAgent = require("user-agents");

const { scraper, parseHtml } = require("../../helper");

const baseUrl = "https://mtlnovel.com";

const novelsScraper = async (req, res) => {
    const url = `${baseUrl}/alltime-rank/`;

    const body = await scraper(url);

    $ = cheerio.load(body);

    let novels = [];

    $("div.box.wide").each(function (result) {
        const novelName = $(this).find("a.list-title").text().slice(4);
        const novelCover = $(this).find("amp-img").attr("src");

        let novelUrl = $(this).find("a.list-title").attr("href");
        novelUrl = novelUrl.replace("https://www.mtlnovel.com/", "");

        const novel = {
            extensionId: 5,
            novelUrl,
            novelName,
            novelCover,
        };

        novels.push(novel);
    });

    res.json(novels);
};

const novelScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;

    const url = `${baseUrl}/${novelUrl}`;

    const body = await scraper(url);

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 5;

    novel.sourceName = "MTLNovel";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("h1.entry-title").text();

    novel.novelCover = $(".nov-head > amp-img").attr("src");

    novel.novelSummary = $("div.desc > h2").next().text();

    novel["Author(s)"] = $("tr > td")
        .filter(function () {
            return $(this).prev().text().trim() === "Author";
        })
        .next()
        .text()
        .replace("Auhtor:", "");

    novel.Status = $("tr > td")
        .filter(function () {
            return $(this).prev().text().trim() === "Status";
        })
        .next()
        .text()
        .replace("Status:", "");

    novel["Genre(s)"] = $("td")
        .filter(function () {
            return $(this).prev().text().trim() === "Genre";
        })
        .next()
        .text()
        .replace("Genre:", "");

    novel["Artist(s)"] = null;

    const chapterListUrl = url + "/chapter-list/";

    const getChapters = async () => {
        const body = await scraper(chapterListUrl);

        $ = cheerio.load(body);

        let novelChapters = [];

        $("div.ch-list")
            .find("a.ch-link")
            .each(function (result) {
                const chapterName = $(this).text().replace("~ ", "");
                const releaseDate = null;

                let chapterUrl = $(this).attr("href");
                chapterUrl = chapterUrl.replace(
                    `https://www.mtlnovel.com/${novelUrl}/`,
                    ""
                );

                novelChapters.push({
                    chapterUrl,
                    chapterName,
                    releaseDate,
                });
            });
        return novelChapters;
    };

    novel.novelChapters = await getChapters();

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}/${novelUrl}/${chapterUrl}/`;

    const body = await scraper(url);

    $ = cheerio.load(body);

    const chapterName = $("h1.main-title").text();
    let chapterText = $("div.par").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;
    if ($("a.next").attr("href")) {
        nextChapter = $("a.next").attr("href").replace(`/${novelUrl}/`, "");
    }

    let prevChapter = null;
    if ($("a.prev").attr("href")) {
        prevChapter = $("a.prev").attr("href").replace(`/${novelUrl}/`, "");
    }

    chapter = {
        extensionId: 5,
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

    const userAgent = new UserAgent();

    let headers = new fetch.Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
        "user-agent": userAgent,
    });

    const result = await fetch(baseUrl, {
        method: "POST",
        body: { s: searchTerm },
        headers: headers,
    });
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $("div.box").each(function (result) {
        const novelName = $(this).find("a.list-title").text();
        const novelCover = $(this).find("amp-img").attr("src");

        let novelUrl = $(this).find("a").attr("href");
        novelUrl = novelUrl.replace("https://www.mtlnovel.com/", "");

        const novel = {
            extensionId: 5,
            novelUrl,
            novelName,
            novelCover,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = mtlNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
