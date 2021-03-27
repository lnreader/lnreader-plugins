const express = require("express");
const cheerio = require("cheerio");
const request = require("request");

const router = express.Router();

const baseUrl = "https://www.readlightnovel.org";

const searchUrl = "https://www.readlightnovel.org/detailed-search";

// Top Novels

router.get("/novels/", (req, res) => {
    // orderBy = req.query.o;
    let novels = [];

    url = `${baseUrl}/top-novel?change_type=top_rated`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        $(".top-novel-block").each(function (result) {
            novelName = $(this).find(".top-novel-header > h2 > a").text();
            novelCover = $(this).find("img").attr("src");
            novelUrl = $(this)
                .find(".top-novel-header > h2 > a")
                .attr("href")
                .replace(`${baseUrl}/`, "");
            novel = {
                extensionId: 2,
                novelName: novelName,
                novelCover: novelCover,
                novelUrl: `${novelUrl}/`,
            };

            novels.push(novel);
        });

        res.json(novels);
    });
});

// Novel

router.get("/novel/:novelUrl", (req, res) => {
    novelUrl = req.params.novelUrl;
    url = `${baseUrl}/${novelUrl}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        let novel = {};

        novel.extensionId = 2;

        novel.sourceName = "ReadLightNovel";

        novel.sourceUrl = url;

        novel.novelUrl = `${novelUrl}/`;

        novel.novelName = $(".block-title > h1").text();

        novel.novelCover = $(".novel-cover > a > img").attr("src");

        $(".novel-detail-item").each(function (result) {
            detailName = $(this)
                .find(".novel-detail-header > h6")
                .text()
                .replace(/[\t\n]/g, "")
                .trim();
            detail = $(this)
                .find(".novel-detail-body")
                .text()
                // .replace(/[\t\n]/g, " ")
                .trim();

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

        $(".tab-content")
            .find("li")
            .each(function (result) {
                chapterName = $(this)
                    .find("a")
                    .text()
                    .replace(/[\t\n]/g, "")
                    .trim();

                releaseDate = null;
                // $(this)
                //     .find("span")
                //     .text()
                //     .replace(/[\t\n]/g, "")
                //     .trim();

                chapterUrl = $(this)
                    .find("a")
                    .attr("href")
                    .replace(baseUrl, "");

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

// Chapter

router.get("/novel/:novelUrl/:chapterUrl/:volumeUrl?", (req, res) => {
    req.params.volumeUrl
        ? (optionalUrl = req.params.volumeUrl)
        : (optionalUrl = "");

    url = `${baseUrl}/${req.params.novelUrl}/${req.params.chapterUrl}/${optionalUrl}`;

    request(url, (err, response, body) => {
        if (err) throw err;

        $ = cheerio.load(body);

        $(".block-title > h1").find("a").remove();

        chapterName = $(".block-title > h1").text().replace(" - ", "");

        // $(".desc").find(".trinity-player-iframe-wrapper").remove();

        chapterText = $(".desc").text();

        let nextChapter = null;

        if ($("a.next.next-link").length) {
            nextChapter = $("a.next.next-link")
                .attr("href")
                .replace(`${baseUrl}/${req.params.novelUrl}/`, "");
        }

        let prevChapter = null;

        if ($("a.prev.prev-link").length) {
            prevChapter = $("a.prev.prev-link")
                .attr("href")
                .replace(`${baseUrl}/${req.params.novelUrl}/`, "");
        }

        chapter = {
            extensionId: 2,
            novelUrl: req.params.novelUrl,
            chapterUrl: `${req.params.chapterUrl}/${optionalUrl}`,
            chapterName,
            chapterText,
            nextChapter,
            prevChapter,
        };

        res.json(chapter);
    });
});

router.get("/search/", (req, res) => {
    searchTerm = req.query.s;

    request.post(
        { url: searchUrl, form: { keyword: searchTerm, search: 1 } },
        (err, response, body) => {
            if (err) throw err;

            $ = cheerio.load(body);

            let novels = [];

            $(".top-novel-block").each(function (result) {
                novelName = $(this).find(".top-novel-header > h2 > a").text();
                novelCover = $(this).find("img").attr("src");
                novelUrl = $(this)
                    .find(".top-novel-header > h2 > a")
                    .attr("href")
                    .replace(`${baseUrl}/`, "");
                novel = {
                    extensionId: 2,
                    novelName: novelName,
                    novelCover: novelCover,
                    novelUrl: `${novelUrl}/`,
                };

                novels.push(novel);
            });

            res.json(novels);
        }
    );
});

module.exports = router;
