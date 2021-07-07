const cheerio = require("cheerio");
const fetch = require("node-fetch");
const FormData = require("form-data");
const { parseHtml } = require("../../src/helper");

class MadaraScraper {
    constructor(extensionId, baseUrl, sourceName, path) {
        this.extensionId = extensionId;
        this.baseUrl = baseUrl;
        this.sourceName = sourceName;
        this.path = path;

        this.novelsScraper = this.novelsScraper.bind(this);
        this.novelScraper = this.novelScraper.bind(this);
        this.chapterScraper = this.chapterScraper.bind(this);
        this.searchScraper = this.searchScraper.bind(this);
    }

    async novelsScraper(req, res) {
        let url = this.baseUrl + this.path.novels + "/?m_orderby=rating";
        let extensionId = this.extensionId;

        const result = await fetch(url);
        const body = await result.text();

        const $ = cheerio.load(body);

        let novels = [];

        $(".manga-title-badges").remove();

        $(".page-item-detail").each(function (result) {
            const novelName = $(this).find(".post-title").text().trim();
            let image = $(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");

            let novelUrl = $(this)
                .find(".post-title")
                .find("a")
                .attr("href")
                .split("/")[4];

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
        const url = `${this.baseUrl}${this.path.novel}/${novelUrl}/`;

        const result = await fetch(url);
        const body = await result.text();

        let $ = cheerio.load(body);

        let novel = {};

        novel.extensionId = this.extensionId;

        novel.sourceName = this.sourceName;

        novel.sourceUrl = url;

        novel.novelUrl = novelUrl;

        $(".manga-title-badges").remove();

        novel.novelName = $(".post-title > h1").text().trim();

        novel.novelCover =
            $(".summary_image > a > img").attr("data-src") ||
            $(".summary_image > a > img").attr("src");

        $(".post-content_item").each(function (result) {
            const detailName = $(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = $(this).find(".summary-content").text().trim();

            switch (detailName) {
                case "Genre(s)":
                    novel["Genre(s)"] = detail.replace(/[\t\n]/g, ",");
                    break;
                case "Author(s)":
                    novel["Author(s)"] = detail;
                    break;
                case "Status":
                    novel.Status = detail;
                    break;
            }
        });

        novel.novelSummary = $("div.summary__content").text().trim();

        let novelChapters = [];

        const novelId =
            $(".rating-post-id").attr("value") ||
            $("#manga-chapters-holder").attr("data-id");

        let formData = new FormData();
        formData.append("action", "manga_get_chapters");
        formData.append("manga", novelId);

        const data = await fetch(this.baseUrl + "wp-admin/admin-ajax.php", {
            method: "POST",
            body: formData,
        });
        const text = await data.text();

        $ = cheerio.load(text);

        $(".wp-manga-chapter").each(function (result) {
            const chapterName = $(this)
                .find("a")
                .text()
                .replace(/[\t\n]/g, "")
                .trim();

            const releaseDate = $(this)
                .find("span")
                .text()
                .replace("Free", "")
                .trim();

            const chapterUrl = $(this).find("a").attr("href").split("/")[5];

            novelChapters.push({ chapterName, releaseDate, chapterUrl });
        });

        novel.novelChapters = novelChapters.reverse();

        res.json(novel);
    }

    async chapterScraper(req, res) {
        let novelUrl = req.params.novelUrl;
        let chapterUrl = req.params.chapterUrl;

        let extensionId = this.extensionId;

        const url = `${this.baseUrl}${this.path.chapter}/${novelUrl}/${chapterUrl}`;

        const result = await fetch(url);
        const body = await result.text();

        const $ = cheerio.load(body);

        let chapterName =
            $(".text-center").text() || $("#chapter-heading").text();

        let chapterText = $(".text-left").html();
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

        const url = `${this.baseUrl}?s=${searchTerm}&post_type=wp-manga`;

        const result = await fetch(url);
        const body = await result.text();

        const $ = cheerio.load(body);

        let novels = [];
        let extensionId = this.extensionId;

        $(".c-tabs-item__content").each(function (result) {
            const novelName = $(this).find(".post-title").text().trim();

            let image = $(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");

            let novelUrl = $(this)
                .find(".post-title")
                .find("a")
                .attr("href")
                .split("/")[4];

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
