const express = require("express");
const cheerio = require("cheerio");
const request = require("request");

const baseUrl = "https://www.wuxiaworld.com/";

const router = express.Router();

router.get("/novels/", async (req, res) => {
    let url = `https://www.wuxiaworld.com/api/novels`;

    request(url, (err, response, body) => {
        if (err) throw err;

        let novels = [];

        let data = JSON.parse(body);
        data = data.items;

        data.map((novel) => {
            let novelName = novel.name;
            let novelCover = novel.coverUrl;
            let novelUrl = novel.slug;
            novelUrl = novelUrl + "/";

            novels.push({
                extensionId: 7,
                novelUrl,
                novelName,
                novelCover,
            });
        });
        res.json(novels);
    });
});

// Novel

router.get("/novel/:novelUrl", async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let url = `${baseUrl}novel/${novelUrl}/`;

    request(url, (err, response, body) => {
        if (err) throw err;
        const $ = cheerio.load(body);

        let novel = {};

        novel.extensionId = 7;

        novel.sourceName = "WuxiaWorld";

        novel.sourceUrl = url;

        novel.novelUrl = `${novelUrl}/`;

        novel.novelName = $("h2").text();

        novel.novelCover = $("img.img-thumbnail").attr("src");

        novel.novelSummary = $(".fr-view > p").text();

        novel["Author(s)"] = $("div > dt")
            .filter(function () {
                return $(this).text().trim() === "Author:";
            })
            .next()
            .text();

        let genres = [];

        $(".genres")
            .find("div")
            .each(function (res) {
                genres.push($(this).find("a").text());
            });

        novel["Genre(s)"] = genres.join(",");

        novel["Artist(s)"] = null;

        novel.Status = null;

        let novelChapters = [];

        $(".chapter-item").each(function (result) {
            let chapterName = $(this).text();
            chapterName = chapterName.replace(/[\t\n]/g, "");

            let releaseDate = null;
            let chapterUrl = $(this).find("a").attr("href");
            chapterUrl = chapterUrl.replace(`/novel/${novelUrl}/`, "");

            novelChapters.push({
                chapterName,
                releaseDate,
                chapterUrl,
            });
        });

        novel.novelChapters = novelChapters;

        res.json(novel);
    });
});

router.get("/novel/:novelUrl/:chapterUrl", async (req, res) => {
    let url = `${baseUrl}novel/${req.params.novelUrl}/${req.params.chapterUrl}`;

    const novelUrl = `${req.params.novelUrl}/`;
    const chapterUrl = `${req.params.chapterUrl}/`;

    request(url, (err, response, body) => {
        if (err) throw err;
        const $ = cheerio.load(body);

        let chapterName = $("#sidebar-toggler-container").next().text();
        chapterName = chapterName.replace(/[\t\n]/g, "");

        let chapterText = $("#chapter-content").text();

        let nextChapter = null;

        if ($("li.next > a").attr("href") !== "#") {
            nextChapter = $("li.next > a")
                .attr("href")
                .replace(`/novel/${novelUrl}`, "");
        }

        let prevChapter = null;

        if ($("li.prev > a").attr("href") !== "#") {
            prevChapter = $("li.prev > a")
                .attr("href")
                .replace(`/novel/${novelUrl}`, "");
        }
        chapter = {
            extensionId: 7,
            novelUrl,
            chapterUrl,
            chapterName,
            chapterText,
            nextChapter,
            prevChapter,
        };

        res.json(chapter);
    });
});

router.get("/search/", (req, res) => {
    let searchTerm = req.query.s;
    searchTerm = encodeURI(searchTerm);
    const searchUrl = `https://www.wuxiaworld.com/api/novels/search?query=}`;

    const url = `${searchUrl}${searchTerm}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let novels = [];

        let data = JSON.parse(body);
        data = data.items;

        data.map((novel) => {
            let novelName = novel.name;
            let novelCover = novel.coverUrl;
            let novelUrl = novel.slug;
            novelUrl = novelUrl + "/";

            novels.push({
                extensionId: 7,
                novelUrl,
                novelName,
                novelCover,
            });
        });
        res.json(novels);
    });
});

module.exports = router;
