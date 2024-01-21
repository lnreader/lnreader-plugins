import { load as parseHTML} from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

interface NovelEntry {
    name: string;
    coverUrl: string;
    slug: string;
}

class WuxiaWorld implements Plugin.PluginBase {
    id = "wuxiaworld";
    name = "Wuxia World";
    icon = "src/en/wuxiaworld/icon.png";
    site = "https://www.wuxiaworld.com/";
    filters?: Filters | undefined;
    version = "0.5.0";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const link = `${this.baseUrl}api/novels`;

        const result = await fetch(link);
        const data = await result.json();

        let novels: Plugin.NovelItem[] = [];

        data.items.map((novel: NovelEntry) => {
            let name = novel.name;
            let cover = novel.coverUrl;
            let url = this.baseUrl + "novel/" + novel.slug + "/";

            novels.push({
                name,
                cover,
                url,
            });
        });

        return novels;
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const url = novelUrl;
        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("h1.line-clamp-2").text();

        novel.cover = loadedCheerio("img.absolute").attr("src");

        novel.summary = loadedCheerio(
            "div.flex-col:nth-child(4) > div > div > span > span"
        )
            .text()
            .trim();

        novel.author = loadedCheerio("div.MuiGrid-container > div > div > div")
            .filter(function () {
                return loadedCheerio(this).text().trim() === "Author:";
            })
            .next()
            .text();

        let genres: string[] = [];

        loadedCheerio("a.MuiLink-underlineNone").each(function () {
            genres.push(loadedCheerio(this).find("div > div").text());
        });

        novel.genres = genres.join(",");

        novel.status = loadedCheerio("div.font-set-b10")
            .text();

        let chapter: Plugin.ChapterItem[] = [];

        loadedCheerio("div.border-b.border-gray-line-base").each((idx, ele) => {
            const name = loadedCheerio(ele)
                .find("a > div > div > div > span")
                .text();
            const releaseTime = loadedCheerio(ele)
                .find("a > div > div > div > div > span")
                .text();
            let url = loadedCheerio(ele).find("a").attr("href")?.slice(1);
            url = `${this.baseUrl}${url}`;

            chapter.push({ name, releaseTime, url });
        });

        novel.chapters = chapter;

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const result = await fetchApi(chapterUrl);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        loadedCheerio(".chapter-nav").remove();

        loadedCheerio("#chapter-content > script").remove();

        let chapterText = loadedCheerio("#chapter-content").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const searchUrl = "https://www.wuxiaworld.com/api/novels/search?query=";

        const url = `${searchUrl}${searchTerm}`;

        const result = await fetchApi(url);
        const data = await result.json();

        const novels: Plugin.NovelItem[] = [];

        data.items.map((novel: NovelEntry) => {
            let name = novel.name;
            let cover = novel.coverUrl;
            let url = this.baseUrl + "novel/" + novel.slug + "/";

            novels.push({
                name,
                url,
                cover,
            });
        });

        return novels;
    }
    fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

}

export default new WuxiaWorld();