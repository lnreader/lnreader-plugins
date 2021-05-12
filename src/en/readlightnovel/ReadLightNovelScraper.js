const cheerio = require("cheerio");
const fetch = require("node-fetch");
const request = require("request");
const { htmlToText } = require("html-to-text");

const baseUrl = "https://www.readlightnovel.org";
const searchUrl = "https://www.readlightnovel.org/detailed-search";

const novelsScraper = async (req, res) => {
    const url = `${baseUrl}/top-novel?change_type=top_rated`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".top-novel-block").each(function (result) {
        const novelName = $(this).find(".top-novel-header > h2 > a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this)
            .find(".top-novel-header > h2 > a")
            .attr("href")
            .replace(`${baseUrl}/`, "");
        novelUrl = novelUrl + "/";

        const novel = {
            extensionId: 2,
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
    const url = `${baseUrl}/${novelUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 2;

    novel.sourceName = "ReadLightNovel";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $(".block-title > h1").text();

    novel.novelCover = $(".novel-cover > a > img").attr("src");

    $(".novel-detail-item").each(function (result) {
        const detailName = $(this)
            .find(".novel-detail-header > h6")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();
        const detail = $(this).find(".novel-detail-body").text().trim();

        novel[detailName] = detail;
    });

    novel.Alternative = novel["Alternative Names"];
    novel.novelSummary = novel.Description;
    novel["Genre(s)"] = novel.Genre.replace(/[\t\n]/g, ", ");
    novel.Release = novel.Year;

    delete novel["Alternative Names"];
    delete novel.Description;
    delete novel.Genre;
    delete novel.Year;

    let novelChapters = [];

    $(".panel").each(function (res) {
        let volumeName = $(this).find("h4.panel-title").text();

        $(this)
            .find("ul.chapter-chs > li")
            .each(function (result) {
                chapterName = $(this)
                    .find("a")
                    .text()
                    .replace(/[\t\n]/g, "")
                    .trim();

                releaseDate = null;

                chapterUrl = $(this).find("a").attr("href");

                chapterUrl = chapterUrl.replace(`${baseUrl}/${novelUrl}/`, "");

                if (volumeName.includes("Volume")) {
                    chapterName = volumeName + " " + chapterName;
                }

                const chapter = {
                    chapterName,
                    releaseDate,
                    chapterUrl,
                };

                novelChapters.push(chapter);
            });
    });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    const novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;
    const volumeUrl = req.params.volumeUrl;

    let optionalUrl;

    if (volumeUrl) {
        optionalUrl = volumeUrl;
    } else {
        optionalUrl = "";
    }

    const url = `${baseUrl}/${novelUrl}/${chapterUrl}/${optionalUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    $(".block-title > h1").find("a").remove();

    const chapterName = $(".block-title > h1").text().replace(" - ", "");

    $(".desc")
        .find("hr")
        .each(function (result) {
            $(this).remove();
        });

    $(".alert").remove();
    $(".hidden").remove();

    let chapterText = $(".desc").html();
    chapterText = htmlToText(chapterText).replace(/\n\nSponsored Content\n\n/g, "");

    let nextChapter = null;

    if ($("a.next.next-link").length) {
        nextChapter = $("a.next.next-link")
            .attr("href")
            .replace(`${baseUrl}/${novelUrl}/`, "");
    }

    let prevChapter = null;

    if ($("a.prev.prev-link").length) {
        prevChapter = $("a.prev.prev-link")
            .attr("href")
            .replace(`${baseUrl}/${novelUrl}/`, "");
    }

    chapterUrl = chapterUrl + "/" + optionalUrl;

    const chapter = {
        extensionId: 2,
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

    request.post(
        { url: searchUrl, form: { keyword: searchTerm, search: 1 } },
        (err, response, body) => {
            $ = cheerio.load(body);

            let novels = [];

            $(".top-novel-block").each(function (result) {
                const novelName = $(this)
                    .find(".top-novel-header > h2 > a")
                    .text();
                const novelCover = $(this).find("img").attr("src");

                let novelUrl = $(this)
                    .find(".top-novel-header > h2 > a")
                    .attr("href")
                    .replace(`${baseUrl}/`, "");
                novelUrl = novelUrl + "/";

                const novel = {
                    extensionId: 2,
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

module.exports = readLightNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
