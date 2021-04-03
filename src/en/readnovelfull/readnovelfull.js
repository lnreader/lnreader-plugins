const express = require("express");
const cheerio = require("cheerio");
const request = require("request");

const router = express.Router();

const baseUrl = "https://readnovelfull.com";

// Top novels

router.get("/novels/", (req, res) => {
    url = `${baseUrl}/most-popular-novel`;

    request(url, (err, response, body) => {
        if (err) throw err;

        let novels = [];

        $ = cheerio.load(body);

        $("div.col-novel-main > div.list-novel > .row").each(function (result) {
            let novelUrl = $(this)
                .find("h3.novel-title > a")
                .attr("href")
                .replace(".html", "")
                .substring(1);
            novelUrl = `${novelUrl}/`;
            let novelName = $(this).find("h3.novel-title > a").text();
            let novelCover = $(this).find("img").attr("src");

            novel = {
                extensionId: 4,
                novelUrl,
                novelName,
                novelCover,
            };

            novels.push(novel);
        });

        res.json(novels);
    });
});

router.get("/novel/:novelUrl", (req, res) => {
    let novelUrl = req.params.novelUrl;
    url = `${baseUrl}/${novelUrl}.html`;

    request(url, (err, response, body) => {
        $ = cheerio.load(body);

        let novel = {};

        novel.extensionId = 4;

        novel.sourceName = "ReadNovelFull";

        novel.sourceUrl = url;

        novel.novelUrl = `${novelUrl}/`;

        novel.novelName = $("div.book > img").attr("alt");

        novel.novelCover = $("div.book > img").attr("src");

        novel.novelSummary = $("div.desc-text").text();

        novel["Author(s)"] = $("li > h3")
            .filter(function () {
                return $(this).text().trim() === "Author:";
            })
            .siblings()
            .text();

        novel["Genre(s)"] = $("li")
            .filter(function () {
                return $(this).find("h3").text().trim() === "Genre:";
            })
            .text()
            .replace("Genre:", "");

        novel["Artist(s)"] = null;

        novel.Status = $("li > h3")
            .filter(function () {
                return $(this).text().trim() === "Status:";
            })
            .siblings()
            .text();

        let novelChapters = [];

        $(".panel-body")
            .find("li")
            .each(function (result) {
                chapterName = $(this).find("a").attr("title");

                releaseDate = null;

                chapterUrl = $(this).find("a").attr("href");

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
    let novelUrl = req.params.novelUrl.replace(".html/", "");
    url = `${baseUrl}/${novelUrl}/${req.params.chapterUrl}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let chapterName = $(".chr-title").attr("title");

        chapterText = $("#chr-content").text();

        let nextChapter = null;
        if ($("a#next_chap").attr("href")) {
            nextChapter = $("a#next_chap")
                .attr("href")
                .replace(`/${novelUrl}/`, "");
        }

        let prevChapter = null;
        if ($("a#prev_chap").attr("href")) {
            prevChapter = $("a#prev_chap")
                .attr("href")
                .replace(`/${novelUrl}/`, "");
        }

        chapter = {
            extensionId: 4,
            novelUrl: `${req.params.novelUrl}`,
            chapterUrl: `${req.params.chapterUrl}`,
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
    console.log(searchTerm);
    searchUrl = `https://readnovelfull.com/search?keyword=`;

    url = `${searchUrl}${searchTerm}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let novels = [];

        $("div.col-novel-main > div.list-novel > .row").each(function (result) {
            let novelUrl = $(this)
                .find("h3.novel-title > a")
                .attr("href")
                .replace(".html", "")
                .substring(1);
            novelUrl = `${novelUrl}/`;
            let novelName = $(this).find("h3.novel-title > a").text();
            let novelCover = $(this).find("img").attr("src");

            novel = {
                extensionId: 4,
                novelUrl,
                novelName,
                novelCover,
            };

            novels.push(novel);
        });

        res.json(novels);
    });
});

module.exports = router;
