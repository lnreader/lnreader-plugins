import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";


class NovelFull implements Plugin.PluginBase {
    id = "novelfull";
    name = "NovelFull";
    version = "1.0.0";
    icon = "src/en/novelfull/icon.png";
    site = "https://novelfull.com/";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}most-popular?page=${pageNo}`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".col-truyen-main .list-truyen .row").each((idx, ele) => {
            const novelName = loadedCheerio(ele)
                .find("h3.truyen-title > a")
                .text();

            const novelCover =
                this.baseUrl + loadedCheerio(ele).find("img").attr("src")?.slice(1);

            const novelUrl =
                this.baseUrl +
                loadedCheerio(ele)
                    .find("h3.truyen-title > a")
                    .attr("href")
                    ?.slice(1);

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

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("div.book > img").attr("alt");

        novel.cover = this.baseUrl + loadedCheerio("div.book > img").attr("src");

        novel.summary = loadedCheerio("div.desc-text").text().trim();

        novel.author = loadedCheerio('h3:contains("Author")')
            .parent()
            .contents()
            .text()
            .replace("Author:", "");

        novel.genres = loadedCheerio('h3:contains("Genre")')
            .siblings()
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        novel.status = loadedCheerio('h3:contains("Status")').next().text();

        const novelId = loadedCheerio("#rating").attr("data-novel-id")!;

        async function getChapters(id: string, baseUrl: string) {
            const chapterListUrl =
                baseUrl + "ajax/chapter-option?novelId=" + id;

            const data = await fetchApi(chapterListUrl);
            const chapterlist = await data.text();

            loadedCheerio = parseHTML(chapterlist);

            let chapter: Plugin.ChapterItem[] = [];

            loadedCheerio("select > option").each(function () {
                const chapterName = loadedCheerio(this).text();
                const releaseDate = null;
                const chapterUrl =
                    baseUrl + loadedCheerio(this).attr("value")?.slice(1);

                chapter.push({
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                });
            });
            return chapter;
        }

        novel.chapters = await getChapters(novelId, this.baseUrl);

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const result = await fetchApi(chapterUrl);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        loadedCheerio("#chapter-content div.ads").remove();
        let chapterText = loadedCheerio("#chapter-content").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const searchUrl = `${this.baseUrl}search?keyword=${searchTerm}`;

        const result = await fetchApi(searchUrl);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".col-truyen-main .list-truyen .row").each((idx, ele) => {
            const novelName = loadedCheerio(ele)
                .find("h3.truyen-title > a")
                .text();

            const novelCover =
                this.baseUrl + loadedCheerio(ele).find("img").attr("src")?.slice(1);

            const novelUrl =
                this.baseUrl +
                loadedCheerio(ele)
                    .find("h3.truyen-title > a")
                    .attr("href")
                    ?.slice(1);

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

export default new NovelFull();
