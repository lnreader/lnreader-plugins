const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");
const FormData = require("form-data");

const baseUrl = "https://tunovelaligera.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl + "mejores-novelas-originales/";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".page-item-detail").each(function (result) {
        const novelName = $(this).find(".h5 > a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find(".h5 > a").attr("href").split("/")[4];
        novelUrl += "/";

        const novel = {
            extensionId: 23,
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
    const url = `${baseUrl}novelas/${novelUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 23;

    novel.sourceName = "Tunovelaligera";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $("h1.titulo-novela")
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

    novel["Genre(s)"] = novel.Generos.replace(/, /g, ",");
    novel["Author(s)"] = novel.Autores;
    novel.Status = novel.Estado;
    novel.Status = null;

    novel["Artist(s)"] = novel["Artista(s)"];

    delete novel.Genre;
    delete novel["Artista(s)"];
    delete novel.Autores;
    delete novel.Estado;

    let novelSummary = "";

    $(".summary__content")
        .find("p")
        .each(function () {
            novelSummary += $(this).html();
        });

    novel.novelSummary = htmlToText(novelSummary);

    let novelChapters = [];

    const novelId = $(".wp-manga-action-button").attr("data-post");

    let formData = new FormData();
    formData.append("action", "manga_get_chapters");
    formData.append("manga", novelId);

    const data = await fetch(
        "https://tunovelaligera.com/wp-admin/admin-ajax.php",
        {
            method: "POST",
            body: formData,
        }
    );
    const text = await data.text();

    $ = cheerio.load(text);

    $(".wp-manga-chapter").each(function (result) {
        chapterName = $(this)
            .find("a")
            .text()
            .replace(/[\t\n]/g, "")
            .trim();

        releaseDate = $(this).find("span").text().trim();

        chapterUrl = $(this).find("a").attr("href").split("/");

        chapterUrl[6]
            ? (chapterUrl = chapterUrl[5] + "/" + chapterUrl[6])
            : (chapterUrl = chapterUrl[5]);

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

    const url = `${baseUrl}novelas/${novelUrl}/${optionalUrl}${chapterUrl}/`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h1#chapter-heading").text();

    let chapterText = $(".text-left").html();
    chapterText = parseHtml(chapterText);

    let nextChapter = null;

    if ($(".nav-next").length) {
        nextChapter = $(".nav-next")
            .find("a")
            .attr("href")
            .replace(baseUrl + "novelas/" + novelUrl + "/", "");
    }

    let prevChapter = null;

    if ($(".nav-previous").length) {
        prevChapter = $(".nav-previous")
            .find("a")
            .attr("href")
            .replace(baseUrl + "novelas/" + novelUrl + "/", "");
    }

    novelUrl = novelUrl + "/";
    chapterUrl = optionalUrl + chapterUrl;

    const chapter = {
        extensionId: 23,
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

    const url = `${baseUrl}?s=${searchTerm}&post_type=wp-manga`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".c-tabs-item__content").each(function (result) {
        const novelName = $(this).find(".h4 > a").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find(".h4 > a").attr("href");
        novelUrl = novelUrl.replace(`${baseUrl}novelas/`, "");

        const novel = {
            extensionId: 23,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = tunovelaligeraScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
