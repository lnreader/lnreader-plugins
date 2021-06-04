const cheerio = require("cheerio");
const FormData = require("form-data");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const baseUrl = "https://woopread.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl + "novellist/?m_orderby=rating";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".page-item-detail").each(function (result) {
        const novelName = $(this).find(".h5 > a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find(".h5 > a").attr("href");
        novelUrl = novelUrl.replace(baseUrl + "series/", "");

        const novel = {
            extensionId: 21,
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
    const url = `${baseUrl}series/${novelUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 21;

    novel.sourceName = "WoopRead";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $(".post-title > h1")
        .text()
        .replace(/[\t\n]/g, "")
        .trim();

    novel.novelCover = $(".summary_image > a > img").attr("src");

    $(".post-content_item").each(function (result) {
        detailName = $(this)
            .find(".summary-heading > h5")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();
        detail = $(this)
            .find(".summary-content")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();

        novel[detailName] = detail;
    });

    $(".description-summary > div.summary__content").find("em").remove();

    novel.novelSummary = $(".description-summary > div.summary__content")
        .text()
        .replace(/[\t\n]/g, "");

    let novelChapters = [];

    const novelId = $(".rating-post-id").attr("value");

    let formData = new FormData();
    formData.append("action", "manga_get_chapters");
    formData.append("manga", novelId);

    const data = await fetch("https://woopread.com/wp-admin/admin-ajax.php", {
        method: "POST",
        body: formData,
    });
    const text = await data.text();

    $ = cheerio.load(text);

    $(".wp-manga-chapter.free-chap").each(function (result) {
        chapterName = $(this)
            .find("a")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();

        releaseDate = $(this).find("span").text().replace("Free", "").trim();

        chapterUrl = $(this).find("a").attr("href").replace(url, "");

        novelChapters.push({ chapterName, releaseDate, chapterUrl });
    });

    novel.novelChapters = novelChapters.reverse();

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;
    let volumeUrl = req.params.volumeUrl;

    let optionalUrl;

    if (volumeUrl) {
        optionalUrl = volumeUrl + "/";
    } else {
        optionalUrl = "";
    }

    const url = `${baseUrl}series/${novelUrl}/${optionalUrl}${chapterUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    const chapterName = $("h1#chapter-heading").text();
    let chapterText = $(".reading-content").html();
    chapterText = parseHtml(chapterText);
    chapterText = chapterText.replace(/(?<=[[])[\n](?=[h])/g, "");

    let nextChapter = null;

    if ($(".nav-next").length) {
        nextChapter = $(".nav-next")
            .find("a")
            .attr("href")
            .replace(baseUrl + "series/" + novelUrl + "/", "");
    }

    let prevChapter = null;

    if ($(".nav-previous").length) {
        prevChapter = $(".nav-previous")
            .find("a")
            .attr("href")
            .replace(baseUrl + "series/" + novelUrl + "/", "");
    }

    novelUrl += "/";
    chapterUrl = optionalUrl + chapterUrl + "/";

    const chapter = {
        extensionId: 21,
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

    const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga&op=&author=&artist=&release=&adult=`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".c-tabs-item__content").each(function (result) {
        const novelName = $(this).find(".h4 > a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find(".h4 > a").attr("href");
        novelUrl = novelUrl.replace(`${baseUrl}series/`, "");

        const novel = {
            extensionId: 21,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = novelTrenchScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
