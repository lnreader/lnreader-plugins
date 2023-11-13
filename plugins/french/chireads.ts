import { CheerioAPI, load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";

class ChireadsPlugin implements Plugin.PluginBase {
    id: string;
    name: string;
    icon: string;
    site: string;
    version: string;
    userAgent: string;
    cookieString: string;
    constructor() {
        this.id = "chireads.com";
        this.name = "Chireads";
        this.icon = "src/fr/chireads/icon.png";
        this.site = "https://chireads.com";
        this.version = "1.0.0";
        this.userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
        this.cookieString = "''";
    }
    parseNovels(loadedCheerio: CheerioAPI) {
        return [];
    }
    async popularNovels(page: number, options: Plugin.PopularNovelsOptions): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}/category/translatedtales/page/${page}/`;
        const result = await fetchApi(url);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio("#content li").each(function () {
            const novelName = loadedCheerio(this).find(".news-list-tit h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".news-list-tit h5 a")
                .attr("href");

            if (!novelUrl) return;

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });

        return novels;
    };

    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const url = novelUrl;
        const novel: Plugin.SourceNovel = { url };
        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        novel.name = loadedCheerio(".inform-title").text().trim();
        novel.cover = loadedCheerio(".inform-product img").attr("src");
        novel.summary = loadedCheerio(".inform-inform-txt").text().trim();

        let chapters: Plugin.ChapterItem[] = [];

        loadedCheerio(".chapitre-table a").each(function () {
            const chapterName = loadedCheerio(this).text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).attr("href");

            if (!chapterUrl) return;

            chapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapters;

        return novel;
    };

    async parseChapter(chapterUrl: string): Promise<string> {
        const result = await fetchApi(chapterUrl);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio("#content").html() || "";

        return chapterText;
    };

    async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}/search?x=0&y=0&name=${searchTerm}`;
        const result = await fetchApi(url);
        const body = await result.text();
        let loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio("#content li").each(function () {
            const novelName = loadedCheerio(this).find(".news-list-tit h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".news-list-tit h5 a")
                .attr("href");

            if (!novelUrl) return;

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });
        return novels;
    };
    async fetchImage(url: string): Promise<string | undefined>{
        return await fetchFile(url);
    }
};

export default new ChireadsPlugin();