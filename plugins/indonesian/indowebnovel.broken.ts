import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";
import { Filters } from "@libs/filterInputs";

class IndoWebNovel implements Plugin.PluginBase {
    id = "IDWN.id";
    name = "IndoWebNovel";
    icon = "src/id/indowebnovel/icon.png";
    site = "https://indowebnovel.id/id/";
    filters?: Filters | undefined;
    version = "1.0.0";
    baseUrl = this.site
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}daftar-novel/`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".novellist-blc li").each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover;
            const novelUrl = loadedCheerio(this).find("a").attr("href");

            if (!novelUrl || !novelName) return;

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

        novel.name = loadedCheerio(".series-title").text().trim();

        novel.cover = loadedCheerio(".series-thumb > img").attr("src");

        novel.summary = loadedCheerio(".series-synops").text().trim();

        novel.status = loadedCheerio(".status").text().trim();

        const genres: string[] = [];

        loadedCheerio(".series-genres").each(function () {
            genres.push(loadedCheerio(this).find("a").text().trim());
        });

        novel.genres = genres.join(",");

        let chapters: Plugin.ChapterItem[] = [];

        loadedCheerio(".series-chapterlist li").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
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

        const chapterText = loadedCheerio(".readerss").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}daftar-novel/`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".novellist-blc li").each(function () {
            const novelName = loadedCheerio(this).find("a").text();
            const novelCover = defaultCover;
            const novelUrl = loadedCheerio(this).find("a").attr("href");

            if (!novelUrl) return;

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            if (novelName.toLowerCase().includes(searchTerm.toLowerCase())) {
                novels.push(novel);
            }
        });

        return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

}

export default new IndoWebNovel();
