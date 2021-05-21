const cheerio = require("cheerio");
const fetch = require("node-fetch");

const baseUrl = "https://wuxiaworldsite.co/";
const searchUrl = "https://wuxiaworldsite.co/search/";

const novelsScraper = async (req, res) => {
    const url = `${baseUrl}/power-ranking`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".a_item").each((i, el) => {
        const novelName = $(el).find("a").attr("title");
        const novelCover = baseUrl + $(el).find("a > img").attr("src");

        let novelUrl = $(el).find(".name_views > a").attr("href");
        novelId = novelUrl.split("/");
        novelUrl = novelId[2] + "/";

        const novel = {
            extensionId: 12,
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
    const url = `${baseUrl}${novelUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    $(".category_list").remove();

    let novel = {};

    novel.extensionId = 12;

    novel.sourceName = "WuxiaWorldSite";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl + "/";

    novel.novelName = $(".content-reading > h1").text().trim();

    novel.novelCover = baseUrl + $(".img-read> img").attr("src");

    novel.novelSummary = $(".story-introduction-content").text();

    novel["Author(s)"] = $(".content-reading > p").text();

    novel["Artist(s)"] = null;

    novel["Genre(s)"] = "";

    $(".a_tag_item").each((i, el) => {
        novel["Genre(s)"] += $(el).text() + ",";
    });

    novel["Genre(s)"] = novel["Genre(s)"].split(",");
    novel["Genre(s)"].pop();

    novel.Status = novel["Genre(s)"].pop();

    novel["Genre(s)"] = novel["Genre(s)"].join(",");

    const novelID = $(".show-more-list").attr("data-id");

    const getChapters = async (novelID) => {
        const chapterListUrl = baseUrl + "/get-full-list.ajax?id=" + novelID;

        const data = await fetch(chapterListUrl);
        const chapters = await data.text();

        $ = cheerio.load(chapters);

        let novelChapters = [];

        $(".new-update-content").each((i, el) => {
            let chapterName = $(el).text().split(/\t+/);
            const releaseDate = chapterName.pop();
            chapterName = chapterName[0];
            let chapterUrl = $(el).attr("href");
            chapterUrl = chapterUrl.split("/").pop();

            const novel = {
                chapterName,
                releaseDate,
                chapterUrl,
            };
            novelChapters.push(novel);
        });
        return novelChapters;
    };

    novel.novelChapters = await getChapters(novelID);

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}/${novelUrl}/${chapterUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterText = $("#content").html() || "";
    let chapterName = "";
    if (chapterText) {
        chapterText = chapterText.split("<br>");
        chapterName = chapterText.shift();
    } else {
        $("p").each((i, el) => {
            if ($(el).css("display") !== "none") {
                chapterText += $(el).text() + "\n";
            }
        });
        chapterText = chapterText.split("\n");
        chapterName = chapterText.shift();
    }

    chapterText = chapterText.join("\n");

    const prevChapter = $(".pre").attr("href")
        ? $(".pre").attr("href").split("/").pop()
        : null;

    const nextChapter = $(".next_sesction > a").attr("href")
        ? $(".next_sesction > a").attr("href").split("/").pop()
        : null;

    novelUrl += "/";
    chapterUrl += "/";

    const chapter = {
        extensionId: 12,
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

    const url = `${searchUrl}${searchTerm}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".a_item").each((i, el) => {
        const novelName = $(el).find(".name_views > a").attr("title");
        const novelCover = baseUrl + $(el).find("a > img").attr("src");
        let novelUrl = $(el).find(".name_views > a").attr("href");
        novelId = novelUrl.split("/");
        novelUrl = novelId[2] + "/";

        const novel = {
            extensionId: 12,
            novelName,
            novelCover,
            novelUrl,
        };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = WuxiaWorldSiteScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
