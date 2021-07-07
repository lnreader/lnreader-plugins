const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../helper");

const baseUrl = "https://lnmtl.com/";

const novelsScraper = async (req, res) => {
    let url = baseUrl + "novel?page=1"; // + page;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = [];

    $(".media").each(function (result) {
        const novelName = $(this).find("h4").text();
        const novelCover = $(this).find("img").attr("src");

        let novelUrl = $(this).find("h4 > a").attr("href");
        novelUrl = novelUrl.replace(baseUrl + "novel/", "");

        const novel = {
            extensionId: 37,
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
    const url = baseUrl + "novel/" + novelUrl;

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novel = {};

    novel.extensionId = 37;

    novel.sourceName = "LNMTL";

    novel.sourceUrl = url;

    novel.novelUrl = novelUrl;

    novel.novelName = $(".novel-name").text();

    novel.novelCover = $("div.novel").find("img").attr("src");

    novel.novelSummary = $("div.description").text().trim();

    novel["Author(s)"] = $(
        "main > div:nth-child(3) > div > div.col-lg-3.col-md-4 > div:nth-child(2) > div.panel-body > dl:nth-child(1) > dd > span"
    ).text();

    novel.Status = $(
        "main > div:nth-child(3) > div > div.col-lg-3.col-md-4 > div:nth-child(2) > div.panel-body > dl:nth-child(2) > dd"
    )
        .text()
        .trim();

    novel["Genre(s)"] = $(
        "main > div.container > div > div.col-lg-3.col-md-4 > div:nth-child(4) > div.panel-body > ul"
    )
        .text()
        .trim()
        .replace(/\s\s/g, ",");

    let volumes = JSON.parse(
        $("main")
            .next()
            .html()
            .match(/lnmtl.volumes = \[(.*?)\]/)[0]
            .replace("lnmtl.volumes = ", "")
    );

    let chapters = [];

    volumes = volumes.map((volume) => volume.id);

    for (const volume of volumes) {
        let volumeData = await fetch(
            `https://lnmtl.com/chapter?page=1&volumeId=${volume}`
        );
        volumeData = await volumeData.json();

        // volumeData = volumeData.data.map((volume) => volume.slug);

        for (let i = 1; i <= volumeData.last_page; i++) {
            let chapterData = await fetch(
                `https://lnmtl.com/chapter?page=${i}&volumeId=${volume}`
            );
            chapterData = await chapterData.json();

            chapterData = chapterData.data.map((chapter) => ({
                chapterName: `#${chapter.number} ${chapter.title}`,
                chapterUrl: chapter.slug,
                releaseDate: chapter.created_at,
            }));

            chapters.push(...chapterData);
        }
    }

    novel.novelChapters = chapters;

    res.json(novel);
};

const chapterScraper = async (req, res) => {
    let novelUrl = req.params.novelUrl;
    let chapterUrl = req.params.chapterUrl;

    const url = `${baseUrl}chapter/${chapterUrl}`;
    console.log(url);

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let chapterName = $("h3 > span.chapter-title").text().trim();

    $(".original").remove();

    let chapterText = $(".chapter-body").html();
    chapterText = chapterName + "\n\n" + parseHtml(chapterText);

    let nextChapter = null;
    let prevChapter = null;

    const chapter = {
        extensionId: 37,
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

    const url = "https://lnmtl.com/term";

    const result = await fetch(url);
    const body = await result.text();

    $ = cheerio.load(body);

    let novels = $("footer")
        .next()
        .next()
        .html()
        .match(/local: \[(.*?)\]/)[0]
        .replace("local: ", "");

    novels = JSON.parse(novels);

    novels = novels.filter((novel) =>
        novel.name.toLowerCase().includes(searchTerm)
    );

    novels = novels.map((novel) => ({
        extensionId: 37,
        novelName: novel.name,
        novelUrl: novel.slug,
        novelCover: novel.image,
    }));

    res.json(novels);
};

module.exports = lnmtlScraper = {
    novelsScraper,
    novelScraper,
    chapterScraper,
    searchScraper,
};
