const express = require("express");
const cheerio = require("cheerio");
const request = require("request");

const baseUrl = "https://www.novelhall.com/";

const router = express.Router();
router.get("/novels/", (req, res) => {
    request(baseUrl, (err, response, body) => {
        if (err) throw err;

        let novels = [];

        $ = cheerio.load(body);

        $("div.section1")
            .find("li")
            .each(function (result) {
                let novelName = $(this).find(".book-info > h2 > a").text();
                let novelCover = $(this).find("img").attr("src");
                let novelUrl = $(this).find("a").attr("href").substring(1);

                novel = {
                    extensionId: 6,
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
    let novelUrl = req.params.novelUrl;
    const url = `${baseUrl}${novelUrl}/`;

    request(url, (err, response, body) => {
        if (err) throw err;

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

        novel["Author(s)"] = $("span.blue")
            .first()
            .text()
            .replace("Author：", "");

        novel["Genre(s)"] = $("a.red").text();

        novel["Artist(s)"] = null;

        novel.Status = $("span.blue")
            .first()
            .next()
            .text()
            .replace("Status：", "");

        let novelChapters = [];

        $("li.post-11").each(function (result) {
            let chapterName = $(this).find("a").text();

            let releaseDate = null;

            let chapterUrl = $(this).find("a").attr("href");

            if (chapterUrl) {
                chapterUrl = chapterUrl.replace(`/${novelUrl}/`, "");
            }

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

router.get("/novel/:novelUrl/:chapterUrl", (req, res) => {
    url = `${baseUrl}${req.params.novelUrl}/${req.params.chapterUrl}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let chapterName = $("h1").text();

        let chapterText = $("div.entry-content").text();

        let nextChapter = null;

        nextChapter = $('a[rel="next"]')
            .attr("href")
            .replace(`/${req.params.novelUrl}/`, "");

        let prevChapter = null;

        prevChapter = $('a[rel="prev"]')
            .attr("href")
            .replace(`/${req.params.novelUrl}/`, "");

        chapter = {
            extensionId: 6,
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
    const searchUrl = `https://www.novelhall.com/index.php?s=so&module=book&keyword=${searchTerm}`;

    request(searchUrl, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let novels = [];

        $("tr").each(function (result) {
            let novelName = $(this)
                .find("td:nth-child(2)")
                .text()
                .replace(/[\t\n]/g, "");

            let novelCover =
                "https://cdn.novelupdates.com/imgmid/noimagemid.jpg";
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
    });
});

module.exports = router;
