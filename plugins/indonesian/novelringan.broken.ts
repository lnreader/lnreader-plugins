import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class NovelRingan implements Plugin.PluginBase {
    id = "novelringan.com";
    name = "NovelRingan";
    icon = "src/id/novelringan/icon.png";
    site = "https://novelringan.com/";
    filters?: Filters | undefined;
    version = "1.0.0";
    baseUrl = this.site;
    coverUriPrefix = "https://i0.wp.com/novelringan.com/wp-content/uploads/";

    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}/top-novel/page/${pageNo}`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio("article.post").each((idx, ele) => {
            const novelName = loadedCheerio(ele)
                .find(".entry-title")
                .text()
                ?.trim();
            const novelCover =
                this.coverUriPrefix + loadedCheerio(ele).find("img").attr("data-sxrx");
            const novelUrl = loadedCheerio(ele).find("h2 > a").attr("href");

            if (!novelUrl) return;

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        });

        return novels;
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const url = novelUrl;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novel: Plugin.SourceNovel = {
            url,
            name: "",
            cover: "",
            genres: "",
            author: "",
            status: NovelStatus.Unknown,
            summary: "",
            chapters: [],
        };

        novel.name = loadedCheerio(".entry-title").text()?.trim();
        novel.cover =
            this.coverUriPrefix +
            loadedCheerio("img.ts-post-image").attr("data-sxrx");
        novel.summary = loadedCheerio(
            "body > div.site-container > div > main > article > div > div.maininfo > span > p"
        ).text();

        let genreSelector = loadedCheerio(
            "body > div.site-container > div > main > article > div > div.maininfo > span > ul > li:nth-child(4)"
        ).text();

        novel.genres = genreSelector.includes("Genre")
            ? genreSelector.replace("Genre:", "").trim()
            : "";

        let statusSelector = loadedCheerio(
            "body > div.site-container > div > main > article > div > div.maininfo > span > ul > li:nth-child(3)"
        ).text();

        novel.status = statusSelector.includes("Status")
            ? statusSelector.replace("Status:", "").trim()
            : NovelStatus.Unknown;

        let chapters: Plugin.ChapterItem[] = [];

        loadedCheerio(".bxcl > ul > li").each(function () {
            const chapterName = loadedCheerio(this).find("a").text();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            const chapter = {
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            };

            chapters.push(chapter);
        });

        novel.chapters = chapters.reverse();

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const url = chapterUrl;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        loadedCheerio('.entry-content div[style="display:none"]').remove();

        const chapterText = loadedCheerio(".entry-content").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = this.baseUrl + "?s=" + searchTerm;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio("article.post").each((idx, ele) => {
            const novelName = loadedCheerio(ele).find(".entry-title").text();
            const novelCover =
                this.coverUriPrefix + loadedCheerio(ele).find("img").attr("data-sxrx");

            const novelUrl = loadedCheerio(ele).find("h2 > a").attr("href");

            if (!novelUrl) return;

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        });
        return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }
    
}

export default new NovelRingan();
