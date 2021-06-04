const cheerio = require("cheerio");
const FormData = require("form-data");
const fetch = require("node-fetch");
const UserAgent = require("user-agents");

const { scraper, parseHtml } = require("../../helper");

const baseUrl = "https://www.mtlnovel.com";

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

    const searchUrl =
        "https://www.mtlnovel.com/wp-admin/admin-ajax.php?action=autosuggest&q=" +
        searchTerm +
        "&__amp_source_origin=https%3A%2F%2Fwww.mtlnovel.com";

    const result = await fetch(searchUrl);
    const body = await result.json();

    let novels = [];

    // $("div.box").each(function (result) {
    //     const novelName = $(this).find("a.list-title").text();
    //     if (novelName && novelName !== "{{permalink}}") {
    //         const novelCover = $(this).find("amp-img").attr("src");

    //         let novelUrl = $(this).find("a").attr("href");
    //         novelUrl = novelUrl.replace("https://www.mtlnovel.com/", "");

    //         const novel = {
    //             extensionId: 5,
    //             novelUrl,
    //             novelName,
    //             novelCover,
    //         };

    //         novels.push(novel);
    //     }
    // });

    body.items[0].results.map((item) => {
        const novelName = item.title.replace(/<\/?strong>/g, "");
        const novelCover = item.thumbnail;
        const novelUrl = item.permalink.replace(
            "https://www.mtlnovel.com/",
            ""
        );

        const novel = { extensionId: 5, novelName, novelCover, novelUrl };

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
