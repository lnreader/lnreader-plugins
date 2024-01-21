import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class NovelsOnline implements Plugin.PluginBase {
    id = "NO.net";
    name = "novelsOnline";
    site = "https://novelsonline.net";
    icon = "src/coverNotAvailable.jpg";
    filters?: Filters | undefined;
    version = "1.0.0";

    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        return []; /** TO DO */
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        let novel: Plugin.SourceNovel = {
            url: novelUrl,
            chapters: [],
        };

        const result = await fetchApi(novelUrl).then((res) => res.text());
        
        let $ = parseHTML(result);

        novel.name = $("h1").text();
        novel.cover = $(".novel-cover").find("a > img").attr("src");
        novel.author = $(
            "div.novel-details > div:nth-child(5) > div.novel-detail-body"
        )
            .find("li")
            .map((_, el) => $(el).text())
            .get()
            .join(", ");

        novel.genres = $(
            "div.novel-details > div:nth-child(2) > div.novel-detail-body"
        )
            .find("li")
            .map((_, el) => $(el).text())
            .get()
            .join(",");

        novel.summary = $(
            "div.novel-right > div > div:nth-child(1) > div.novel-detail-body"
        ).text();

        novel.chapters = $("ul.chapter-chs > li > a")
            .map((_, el) => {
                const chapterUrl = $(el).attr("href");
                const chapterName = $(el).text();

                return {
                    name: chapterName,
                    releaseTime: "",
                    url: chapterUrl,
                } as Plugin.ChapterItem;
            })
            .get();

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const result = await fetchApi(chapterUrl).then((res) => res.text());
        let loadedCheerio = parseHTML(result);

        const chapterText = loadedCheerio("#contentall").html() || "";

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const result = await fetchApi(
            "https://novelsonline.net/sResults.php",
            {
                headers: {
                    Accept: "*/*",
                    "Accept-Language": "pl,en-US;q=0.7,en;q=0.3",
                    "Content-Type":
                        "application/x-www-form-urlencoded; charset=UTF-8",
                },
                method: "POST",
                body: "q=" + encodeURIComponent(searchTerm),
            },
        ).then((res) => res.text());
        
        let $ = parseHTML(result);
    
        const headers = $("li");
        return headers
            .map((i, h) => {
                const novelName = $(h).text();
                const novelUrl = $(h).find("a").attr("href");
                const novelCover = $(h).find("img").attr("src");
    
                if (!novelUrl) {
                    return null;
                }
    
                return {
                    name: novelName,
                    cover: novelCover,
                    url: novelUrl,
                };
            })
            .get()
            .filter((sr) => sr !== null)
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

}

export default new NovelsOnline();
