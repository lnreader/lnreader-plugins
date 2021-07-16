const cheerio = require("cheerio");
const fetch = require("node-fetch");
const { parseHtml } = require("../../src/helper");

class MadaraScraper {
    constructor(extensionId, baseUrl, sourceName) {
        this.extensionId = extensionId;
        this.baseUrl = baseUrl;
        this.sourceName = sourceName;

        this.novelsScraper = this.novelsScraper.bind(this);
        this.novelScraper = this.novelScraper.bind(this);
        this.chapterScraper = this.chapterScraper.bind(this);
        this.searchScraper = this.searchScraper.bind(this);
    }

    async novelsScraper(req, res) {
        let url = this.baseUrl + "series/?m_orderby=popular";
        let extensionId = this.extensionId;

        const result = await fetch(url);
        const body = await result.text();

        const $ = cheerio.load(body);

        let novels = [];

        $("article.bs").each(function (result) {
            const novelName = $(this).find(".ntitle").text().trim();
            let image = $(this).find("img");
            const novelCover = image.attr("src");

            let novelUrl = $(this).find("a").attr("href").split("/")[4];

            const novel = {
                extensionId,
                novelName,
                novelCover,
                novelUrl,
            };

            novels.push(novel);
        });

        res.json(novels);
    }

    async novelScraper(req, res) {
        const novelUrl = req.params.novelUrl;
        const url = `${this.baseUrl}series/${novelUrl}/`;

        const result = await fetch(url);
        const body = await result.text();

        let $ = cheerio.load(body);

        let novel = {};

        novel.extensionId = this.extensionId;

        novel.sourceName = this.sourceName;

        novel.sourceUrl = url;

        novel.novelUrl = novelUrl;

        novel.novelName = $(".entry-title").text();

        novel.novelCover = $("img.thumb").attr("src");

        $("div.spe > span").each(function (result) {
            const detailName = $(this).find("b").text().trim();
            const detail = $(this).find("b").next().text().trim();

            if ($(this).text().includes("الحالة:")) {
                novel.Status = $(this).text().replace("الحالة: ", "");
            }

            switch (detailName) {
                case "المؤلف:":
                    novel["Author(s)"] = detail;
                    break;
            }
        });

        novel["Genre(s)"] = $(".genxed").text().replace(/\s/g, ",");

        novel.novelSummary = $('div[itemprop="description"]').text().trim();

        let novelChapters = [];

        $(".eplister")
            .find("li")
            .each(function (result) {
                const chapterName =
                    $(this).find(".epl-num").text() +
                    " - " +
                    $(this).find(".epl-title").text();

                const releaseDate = $(this).find(".epl-date").text().trim();

                const chapterUrl = $(this).find("a").attr("href").split("/")[3];

                novelChapters.push({ chapterName, releaseDate, chapterUrl });
            });

        novel.novelChapters = novelChapters.reverse();

        res.json(novel);
    }

    async chapterScraper(req, res) {
        let novelUrl = req.params.novelUrl;
        let chapterUrl = req.params.chapterUrl;

        let extensionId = this.extensionId;

        const url = `${this.baseUrl}${chapterUrl}`;

        const result = await fetch(url);
        const body = await result.text();

        const $ = cheerio.load(body);

        let chapterName = $(".entry-title").text();

        let chapterText = $(".entry-content").html();
        chapterText = parseHtml(chapterText);

        let nextChapter = null;
        let prevChapter = null;

        const chapter = {
            extensionId,
            novelUrl,
            chapterUrl,
            chapterName,
            chapterText,
            nextChapter,
            prevChapter,
        };

        res.json(chapter);
    }

    async searchScraper(req, res) {
        const searchTerm = req.query.s;

        const url = `${this.baseUrl}?s=${searchTerm}`;

        const result = await fetch(url);
        const body = await result.text();

        const $ = cheerio.load(body);

        let novels = [];
        let extensionId = this.extensionId;

        $("article.bs").each(function (result) {
            const novelName = $(this).find(".ntitle").text().trim();
            let image = $(this).find("img");
            const novelCover = image.attr("src");

            let novelUrl = $(this).find("a").attr("href").split("/")[4];

            const novel = {
                extensionId,
                novelName,
                novelCover,
                novelUrl,
            };

            novels.push(novel);
        });

        res.json(novels);
    }
}

module.exports = MadaraScraper;
