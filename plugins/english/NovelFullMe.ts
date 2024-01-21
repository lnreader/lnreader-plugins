import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class NovelFull implements Plugin.PluginBase {
    id = "NF.me";
    name = "NovelFullMe";
    site = "https://novelfull.me/";
    version = "1.0.0";
    filters?: Filters | undefined;
    icon = "src/en/novelfullme/icon.png";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}popular?page=${pageNo}`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".book-item").each((idx, ele) => {
            const novelName = loadedCheerio(ele).find(".title").text();
            const novelCover =
                "https:" + loadedCheerio(ele).find("img").attr("data-src");
            const novelUrl =
                this.baseUrl +
                loadedCheerio(ele).find(".title a").attr("href")?.substring(1);

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });

        return novels;
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const url = novelUrl;

        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Plugin.SourceNovel = {
            url,
            name: "",
            cover: "",
            author: "",
            status: "",
            genres: "",
            summary: "",
            chapters: [],
        };

        novel.name = loadedCheerio(".name h1").text().trim();

        novel.cover =
            "https:" + loadedCheerio(".img-cover img").attr("data-src");

        novel.summary = loadedCheerio(
            "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.mt-1 > div.section.box.mt-1.summary > div.section-body > p.content"
        )
            .text()
            .trim();

        novel.author = "Unknown";

        novel.status = loadedCheerio(
            "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(1) > a > span"
        )
            .text()
            ?.trim();

        novel.genres = loadedCheerio(
            "body > div.layout > div.main-container.book-details > div > div.row.no-gutters > div.col-lg-8 > div.book-info > div.detail > div.meta.box.mt-1.p-10 > p:nth-child(2)"
        )
            .text()
            ?.replace("Genres :", "")
            .replace(/[\s\n]+/g, " ")
            .trim();

        let chapters: Plugin.ChapterItem[] = [];

        const chaptersUrl =
            novelUrl.replace(this.baseUrl, "https://novelfull.me/api/novels/") +
            "/chapters?source=detail";

        const chaptersRequest = await fetchApi(chaptersUrl);
        const chaptersHtml = await chaptersRequest.text();

        loadedCheerio = parseHTML(chaptersHtml);

        loadedCheerio("li").each(function () {
            const chapterName = loadedCheerio(this)
                .find(".chapter-title")
                .text()
                .trim();

            const releaseDate = loadedCheerio(this)
                .find(".chapter-update")
                .text()
                .trim();

            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            chapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapters.reverse();

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const url = chapterUrl;

        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        loadedCheerio("#listen-chapter").remove();
        loadedCheerio("#google_translate_element").remove();

        const chapterText = loadedCheerio(".chapter__content").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}search?status=all&sort=views&q=${searchTerm}`;

        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".book-item").each((idx, ele) => {
            const novelName = loadedCheerio(ele).find(".title").text();
            const novelCover =
                "https:" + loadedCheerio(ele).find("img").attr("data-src");
            const novelUrl =
                this.baseUrl +
                loadedCheerio(ele).find(".title a").attr("href")?.substring(1);

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });

        return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }
    
}

export default new NovelFull();
