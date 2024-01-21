import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class MTLReader implements Plugin.PluginBase {
    id = "mtlreader";
    name = "MTL Reader";
    version = "1.0.0";
    icon = "src/en/mtlreader/icon.png";
    site = "https://mtlreader.com/";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}novels?page=${pageNo}`;

        const body = await fetchApi(url).then((r) => r.text());

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".col-md-4.col-sm-4").each(function () {
            const novelName = loadedCheerio(this).find("h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h5 > a").attr("href");

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

        const body = await fetchApi(url).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio(".agent-title").text().trim();

        novel.cover = loadedCheerio(".agent-p-img > img").attr("src");

        novel.summary = loadedCheerio("#editdescription").text().trim();

        novel.author = loadedCheerio("i.fa-user")
            .parent()
            .text()
            .replace("Author: ", "")
            .trim();

        let chapter: Plugin.ChapterItem[] = [];

        loadedCheerio("tr.spaceUnder").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = null;
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapter;

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const body = await fetchApi(chapterUrl).then((r) => r.text());

        const loadedCheerio = parseHTML(body);

        loadedCheerio(".container ins,script,p.mtlreader").remove();
        const chapterText = loadedCheerio(".container").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}search?input=${searchTerm}`;

        const body = await fetchApi(url).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".col-md-4.col-sm-4").each(function () {
            const novelName = loadedCheerio(this).find("h5").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h5 > a").attr("href");

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
export default new MTLReader();
