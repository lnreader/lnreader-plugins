const cheerio = require("cheerio");
const fetch = require("node-fetch");
var FormData = require("form-data");
const { htmlToText } = require("html-to-text");

const baseUrl = "http://www.tapread.com";

const novelsScraper = async (req, res) => {
    const result = await fetch(baseUrl);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".section-item").each(function (result) {
        const novelName = $(this).find(".book-name").text();
        const novelCover = $(this).find("img").attr("src");
        let novelUrl = $(this).attr("data-id");
        novelUrl += "/";

        const novel = {
            extensionId: 17,
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
    const url = `${baseUrl}/book/detail/${novelUrl}`;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 17;

    novel.sourceName = "TapRead";

    novel.sourceUrl = url;

    novel.novelUrl = `${novelUrl}/`;

    novel.novelName = $(".book-name").text();

    novel.novelCover = $("div.book-img > img").attr("src");

    novel["Genre(s)"] = $("div.book-catalog > span.txt").text();

    novel.Status = $("div.book-state > span.txt").text();

    novel["Author(s)"] = $("div.author > span.name").text();

    novelSummary = $("div.content > p.desc").html();
    novel.novelSummary = htmlToText(novelSummary);

    const getChapters = async (novelId) => {
        const chapterListUrl = "http://www.tapread.com/ajax/book/contents";

        let formData = new FormData();
        formData.append("bookId", novelId);

        const data = await fetch(chapterListUrl, {
            method: "POST",
            body: formData,
        });

        const chapters = await data.json();

        let novelChapters = [];

        chapters.result.chapterList.map((chapter) => {
            let chapterName = chapter.chapterName;
            const releaseDate = chapter.pubTime;
            const chapterUrl = chapter.chapterId;

            if (chapter.lock) {
                chapterName = "🔒 " + chapterName;
            }

            novelChapters.push({
                chapterUrl,
                chapterName,
                releaseDate,
            });
        });

        return novelChapters;
    };

    novel.novelChapters = await getChapters(novelUrl);

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    let formData = new FormData();
    formData.append("bookId", novelUrl);
    formData.append("chapterId", chapterUrl);

    const url = "http://www.tapread.com/ajax/book/chapter";

    const result = await fetch(url, {
        method: "POST",
        body: formData,
    });
    const body = await result.json();

    const chapterName = body.result.chapterName;
    const chapterText = htmlToText(body.result.content);
    const nextChapter = body.result.nextChapterId;
    const prevChapter = body.result.preChapterId;
    novelUrl += "/";

    const chapter = {
        extensionId: 17,
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

    let formData = new FormData();
    formData.append("storyType", 1);
    formData.append("pageNo", 1);
    formData.append("searchText", searchTerm);

    const url = "http://www.tapread.com/ajax/search/story";

    const data = await fetch(url, {
        method: "POST",
        body: formData,
    });

    const body = await data.json();

    console.log(body.result.storyList);

    const novels = [];

    body.result.storyList.map((novel) => {
        const novelName = novel.storyName.replace(
            '<font color="#FFCE2E">Demon</font>',
            ""
        );
        const novelUrl = novel.storyId + "/";
        const novelCover = novel.coverUrl;

        novels.push({ extensionId: 17, novelName, novelCover, novelUrl });
    });

    res.json(novels);
};

module.exports = tapReadScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
