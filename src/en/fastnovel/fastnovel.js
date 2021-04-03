const express = require("express");
const cheerio = require("cheerio");
const request = require("request");

const baseUrl = "https://fastnovel.net";

const router = express.Router();
router.get("/novels/", (req, res) => {
    url = `https://fastnovel.net/list/most-popular.html`;

    request(url, (err, response, body) => {
        if (err) throw err;

        let novels = [];

        $ = cheerio.load(body);

        $(".film-item").each(function (result) {
            let novelName = $(this).find("div.title > p.name").text();
            let novelCover = $(this).find(".img").attr("data-original");
            let novelUrl = $(this).find("a").attr("href").substring(1);

            novel = {
                extensionId: 3,
                novelName,
                novelCover,
                novelUrl,
            };

            novels.push(novel);
        });

        res.json(novels);
    });
});

// Novel

router.get("/novel/:novelUrl", (req, res) => {
    novelUrl = req.params.novelUrl;
    url = `${baseUrl}/${novelUrl}/`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let novel = {};

        novel.extensionId = 3;

        novel.sourceName = "FastNovel";

        novel.sourceUrl = url;

        novel.novelUrl = `${novelUrl}/`;

        novel.novelName = $("h1").text();

        novel.novelCover = $(".book-cover").attr("data-original");

        novel.novelSummary = $("div.film-content > p").text();

        novel["Author(s)"] = $("li > label")
            .filter(function () {
                return $(this).text().trim() === "Author:";
            })
            .next()
            .text();

        novel["Genre(s)"] = $("li")
            .filter(function () {
                return $(this).find("label").text().trim() === "Genre:";
            })
            .text()
            .replace("Genre:", "");

        novel["Artist(s)"] = null;

        novel.Status = null;

        let novelChapters = [];

        $(".chapter").each(function (result) {
            chapterName = $(this).text();

            releaseDate = null;

            chapterUrl = $(this).attr("href");

            novelChapters.push({
                chapterName,
                releaseDate,
                chapterUrl: chapterUrl.replace(`/${novelUrl}/`, ""),
            });
        });

        novel.novelChapters = novelChapters;

        res.json(novel);
    });
});

router.get("/novel/:novelUrl/:chapterUrl", (req, res) => {
    url = `${baseUrl}/${req.params.novelUrl}/${req.params.chapterUrl}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        chapterName = $(".episode-name").text();

        chapterText = $("#chapter-body").text();

        let nextChapter = null;

        nextChapter = $("div.btn-group > a")
            .filter(function () {
                return $(this).text().trim() === "Next Chapter";
            })
            .attr("href")
            .replace("/", "");

        let prevChapter = null;

        prevChapter = $("div.btn-group > a")
            .filter(function () {
                return $(this).text().trim() === "Prev Chapter";
            })
            .attr("href")
            .replace("/", "");

        chapter = {
            extensionId: 3,
            novelUrl: `${req.params.novelUrl}/`,
            chapterUrl: `${req.params.chapterUrl}/`,
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
    searchUrl = `https://fastnovel.net/search/`;

    url = `${searchUrl}${searchTerm}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let novels = [];

        $(".film-item").each(function (result) {
            let novelName = $(this).find("div.title > p.name").text();
            let novelCover = $(this).find(".img").attr("data-original");
            let novelUrl = $(this).find("a").attr("href").substring(1);

            novel = {
                extensionId: 3,
                novelName,
                novelCover,
                novelUrl,
            };

            novels.push(novel);
        });

        res.json(novels);
    });
});

module.exports = router;
