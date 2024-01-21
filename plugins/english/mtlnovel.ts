import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class MTLNovel implements Plugin.PluginBase {
    id = "mtlnovel";
    name = "MTL Novel";
    version = "1.0.0";
    icon = "src/en/mtlnovel/icon.png";
    site = "https://www.mtlnovel.com/";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}alltime-rank/page/${pageNo}`;
        const body = await fetchApi(url).then((result) => result.text());
        console.log(body);
        
        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio("div.box.wide").each(function () {
            const novelName = loadedCheerio(this)
                .find("a.list-title")
                .text()
                .slice(4);
            const novelCover = loadedCheerio(this).find("amp-img").attr("src");
            const novelUrl = loadedCheerio(this).find("a.list-title").attr("href");

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

        let headers = {
            Referer: `${this.baseUrl}alltime-rank/`,
        };

        const body = await fetchApi(
            url,
            {
                method: "GET",
                headers: headers,
            },
        ).then((result) => result.text());

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("h1.entry-title").text();

        novel.cover = loadedCheerio(".nov-head > amp-img").attr("src");

        novel.summary = loadedCheerio("div.desc > h2").next().text().trim();

        novel.author = loadedCheerio("#author").text();

        novel.status = loadedCheerio("#status").text();

        novel.genres = loadedCheerio("#genre").text().replace(/\s+/g, "");

        const chapterListUrl = url + "chapter-list/";

        async function getChapters() {
            const listResult = await fetch(chapterListUrl);
            const listBody = await listResult.text();

            loadedCheerio = parseHTML(listBody);

            let chapter: Plugin.ChapterItem[] = [];

            loadedCheerio("div.ch-list")
                .find("a.ch-link")
                .each(function () {
                    const chapterName = loadedCheerio(this)
                        .text()
                        .replace("~ ", "");
                    const releaseDate = null;
                    const chapterUrl = loadedCheerio(this).attr("href");
                    if (chapterUrl) {
                        chapter.push({
                            url: chapterUrl,
                            name: chapterName,
                            releaseTime: releaseDate,
                        });
                    }
                });
            return chapter.reverse();
        }

        novel.chapters = await getChapters();

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const body = await fetchApi(chapterUrl).then((r) => r.text());

        const loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio("div.par").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const searchUrl =
            this.baseUrl +
            "wp-admin/admin-ajax.php?action=autosuggest&q=" +
            searchTerm +
            "&__amp_source_origin=https%3A%2F%2Fwww.mtlnovel.com";

        const res = await fetch(searchUrl);
        const result = await res.json();

        let novels: Plugin.NovelItem[] = [];
        interface SearchEntry {
            title: string;
            thumbnail: string;
            permalink: string;
        }
        result.items[0].results.map((item: SearchEntry) => {
            const novelName = item.title.replace(/<\/?strong>/g, "");
            const novelCover = item.thumbnail;
            const novelUrl = item.permalink.replace(
                "https://www.mtlnovel.com/",
                ""
            );

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });

        return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

}
export default new MTLNovel();
