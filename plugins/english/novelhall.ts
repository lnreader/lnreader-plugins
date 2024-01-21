import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class NovelHall implements Plugin.PluginBase {
    id = "novelhold";
    name = "Novel Hall";
    version = "1.0.0";
    icon = "src/en/novelhall/icon.png";
    filters?: Filters | undefined;
    site = "https://novelhall.com/";
    baseUrl = this.site;

    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}all2022-${pageNo}.html`;

        const body = await fetchApi(url).then((r) => r.text());
        
        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio("li.btm").each((idx, ele) => {
            const novelName = loadedCheerio(ele).text().trim()
            const novelUrl =
                this.baseUrl + loadedCheerio(ele).find("a").attr("href");

            const novel = {
                name: novelName,
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

        novel.name = loadedCheerio(".booknav2 > h1").text();

        novel.cover = loadedCheerio('meta[property="og:image"]').attr(
            "content"
        );

        novel.summary = loadedCheerio(".navtxt").text().trim();

        novel.author = loadedCheerio('p:contains("Author")')
            .text()
            .replace("Author：", "")
            .trim();

        novel.status = loadedCheerio('p:contains("Status")')
            .text()
            .replace("Status：", "")
            .replace("Active", "Ongoing")
            .trim();

        novel.genres = loadedCheerio('p:contains("Genre")')
            .text()
            ?.replace("Genre：", "")
            .trim();

        let chapter: Plugin.ChapterItem[] = [];

        loadedCheerio("#morelist ul > li").each((idx, ele) => {
            const chapterName = loadedCheerio(ele).find("a").text().trim();
            const releaseDate = null;
            const chapterUrl =
                this.baseUrl + loadedCheerio(ele).find("a").attr("href");

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

        let loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio(".content").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}index.php?s=so&module=book&keyword=${searchTerm}`;

        const body = await fetchApi(url).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio("#article_list_content > li").each((idx, ele) => {
            const novelName = loadedCheerio(ele)
                .find("h3")
                .text()
                .replace(/\t+/g, "")
                .replace(/\n/g, " ");
            const novelCover = loadedCheerio(ele).find("img").attr("data-src");
            const novelUrl =
                this.baseUrl + loadedCheerio(ele).find("a").attr("href")?.slice(1);

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

export default new NovelHall();
