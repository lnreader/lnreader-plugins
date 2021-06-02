const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://novelasligera.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".elementor-column").each(function (result) {
        const novelName = $(this)
            .find(".widget-image-caption.wp-caption-text")
            .text();
        if (novelName) {
            const novelCover = $(this).find("img").attr("src");

            let novelUrl = $(this).find("a").attr("href");
            novelUrl = novelUrl.replace(baseUrl, "");
            novelUrl = novelUrl.replace("novela/", "");

            const novel = {
                extensionId: 26,
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
    const url = baseUrl + "novela/" + novelUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 26;

    novel.sourceName = "Novelas Ligera";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("h1").text();

    novel.novelCover = $(".elementor-widget-container").find("img").attr("src");

    $(".elementor-row")
        .find("p")
        .each(function (result) {
            if ($(this).text().includes("Autor:")) {
                novel["Author(s)"] = $(this)
                    .text()
                    .replace("Autor:", "")
                    .trim();
            }
            if ($(this).text().includes("Estado:")) {
                novel.Status = $(this).text().replace("Estado: ", "").trim();
            }

            if ($(this).text().includes("Género:")) {
                $(this).find("span").remove();
                novel["Genre(s)"] = $(this).text().replace(/,\s/g, ",");
            }
        });

    novel["Artist(s)"] = null;

    let novelSummary = $(".elementor-text-editor.elementor-clearfix").html();
    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    $(".elementor-accordion-item").remove();

    $(".elementor-tab-content")
        .find("li")
        .each(function (result) {
            const chapterName = $(this).text();
            const releaseDate = null;
            const chapterUrl = $(this)
                .find("a")
                .attr("href")
                .replace(baseUrl + "novela/", "");

            const chapter = { chapterName, releaseDate, chapterUrl };

            novelChapters.push(chapter);
        });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;
    const volumeUrl = req.params.volumeUrl;

    let optionalUrl;

    if (volumeUrl) {
        optionalUrl = volumeUrl + "/";
    } else {
        optionalUrl = novelUrl + "/";
    }

    const url = baseUrl + "novela/" + optionalUrl + chapterUrl;
    console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h1.entry-title").text();

    let nextChapter = null;

    // if ($(".wp-post-navigation-next").length > 0) {
    //     nextChapter =
    //         $(".wp-post-navigation-next").find("a").attr("href") || null;
    //     nextChapter && nextChapter.replace(baseUrl + "novela/", "");
    // }

    let prevChapter = null;

    // if ($(".wp-post-navigation-pre").length > 0) {
    //     prevChapter =
    //         $(".wp-post-navigation-pre").find("a").attr("href") || null;
    //     prevChapter && prevChapter.replace(baseUrl + "novela/", "");
    // }

    $(".osny-nightmode.osny-nightmode--left").remove();
    $(".code-block.code-block-1").remove();
    $(".adsb30").remove();
    $(".saboxplugin-wrap").remove();
    $(".wp-post-navigation").remove();

    let chapterText = $(".entry-content").html();
    chapterText = htmlToText(chapterText, { preserveNewlines: true });

    novelUrl = novelUrl + "/";
    chapterUrl = chapterUrl + "/";

    const chapter = {
        extensionId: 26,
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

    const url = baseUrl + "?s=" + searchTerm + "&post_type=wp-manga";
    console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".inside-article").each(function (result) {
        const novelCover = $(this).find("img").attr("src");
        let novelUrl = $(this).find("a").attr("href").split("/")[4];

        let novelName;

        if (novelUrl) {
            novelName = novelUrl.replace(/-/g, " ").replace(/^./, function (x) {
                return x.toUpperCase();
            });
        }

        novelUrl += "/";

        const novel = {
            extensionId: 26,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    novels = [{ ...novels[1] }];

    res.json(novels);
};

module.exports = einharjarProjectScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
