const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { htmlToText } = require("html-to-text");
const { parseHtml } = require("../../helper");

const baseUrl = "https://www.skynovels.net/";

const novelsScraper = async (req, res) => {
    const url = "https://api.skynovels.net/api/novels?&q";

    const result = await fetch(url);
    const body = await result.json();

    const novels = [];

    body.novels.map((res) => {
        const novelName = res.nvl_title;
        const novelCover =
            "https://api.skynovels.net/api/get-image/" +
            res.image +
            "/novels/false";
        const novelUrl = res.id + "/" + res.nvl_name + "/";

        const novel = { extensionId: 24, novelName, novelUrl, novelCover };

        novels.push(novel);
    });

    res.json(novels);
};

const novelScraper = async (req, res) => {
    const novelId = req.params.novelId;
    const novelUrl = req.params.novelUrl;
    const url =
        "https://api.skynovels.net/api/novel/" + novelId + "/reading?&q";

    const result = await fetch(url);
    const body = await result.json();

    const item = body.novel[0];

    let novel = {};

    novel.extensionId = 24;

    novel.sourceName = "SkyNovels";

    novel.sourceUrl = baseUrl + "novelas/" + novelId + "/" + novelUrl;

    novel.novelUrl = novelId + "/" + novelUrl + "/";

    novel.novelName = item.nvl_title;

    novel.novelCover =
        "https://api.skynovels.net/api/get-image/" +
        item.image +
        "/novels/false";

    let genres = [];
    item.genres.map((genre) => genres.push(genre.genre_name));
    novel["Genre(s)"] = genres.join(",");
    novel["Author(s)"] = item.nvl_writer;
    novel.novelSummary = item.nvl_content;
    novel.Status = item.nvl_status;

    let novelChapters = [];

    item.volumes.map((volume) => {
        volume.chapters.map((chapter) => {
            const chapterName = chapter.chp_index_title;
            const releaseDate = new Date(chapter.createdAt).toDateString();
            const chapterUrl = chapter.id + "/" + chapter.chp_name;

            const chap = { chapterName, releaseDate, chapterUrl };

            novelChapters.push(chap);
        });
    });

    novel.novelChapters = novelChapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelId = req.params.novelId;
    let novelUrl = req.params.novelUrl;
    let chapterId = req.params.chapterId;
    let chapterUrl = req.params.chapterUrl;

    const url = `https://api.skynovels.net/api/novel-chapter/${chapterId}`;

    console.log(url);

    const result = await fetch(url);
    const body = await result.json();

    const item = body.chapter[0];

    let chapterName = item.chp_index_title;

    let chapterText = item.chp_title + "\n\n" + item.chp_content;

    let nextChapter = null;
    let prevChapter = null;

    novelUrl = novelId + "/" + novelUrl + "/";
    chapterUrl = item.id + "/" + item.chp_name;

    const chapter = {
        extensionId: 24,
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
    let searchTerm = req.query.s;
    searchTerm = searchTerm.toLowerCase();
    const url = "https://api.skynovels.net/api/novels?&q";

    const result = await fetch(url);
    const body = await result.json();

    let results = body.novels.filter((novel) =>
        novel.nvl_title.toLowerCase().includes(searchTerm)
    );

    const novels = [];

    results.map((res) => {
        const novelName = res.nvl_title;
        const novelCover =
            "https://api.skynovels.net/api/get-image/" +
            res.image +
            "/novels/false";
        const novelUrl = res.id + "/" + res.nvl_name + "/";

        const novel = { extensionId: 24, novelName, novelUrl, novelCover };

        novels.push(novel);
    });

    res.json(novels);
};

module.exports = vipNovelScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
