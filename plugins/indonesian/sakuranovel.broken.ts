import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class SakuraNovel implements Plugin.PluginBase {
    id = "sakura.id";
    name = "SakuraNovel";
    icon = "src/id/sakuranovel/icon.png";
    site = "https://sakuranovel.id/";
    filters?: Filters | undefined;
    version = "1.0.0";
    baseUrl = this.site;

    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}advanced-search/page/${pageNo}/?title&author&yearx&status&type&order=rating&country%5B0%5D=china&country%5B1%5D=jepang&country%5B2%5D=unknown`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".flexbox2-item").each(function () {
            const novelName = loadedCheerio(this)
                .find(".flexbox2-title span")
                .first()
                .text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".flexbox2-content > a")
                .attr("href");

            if (!novelUrl) return;

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });

        return novels;
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const result = await fetchApi(novelUrl);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Plugin.SourceNovel = {
            url: novelUrl,
        };

        novel.name = loadedCheerio(".series-title h2").text().trim();

        novel.cover = loadedCheerio(".series-thumb img").attr("src");

        loadedCheerio(".series-infolist > li").each(function () {
            const detailName = loadedCheerio(this).find("b").text().trim();
            const detail = loadedCheerio(this).find("b").next().text().trim();

            switch (detailName) {
                case "Author":
                    novel.author = detail;
                    break;
            }
        });

        novel.status = loadedCheerio(".status").text().trim();

        novel.genres = loadedCheerio(".series-genres")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        loadedCheerio(".series-synops div").remove();
        novel.summary = loadedCheerio(".series-synops").text().trim();

        let chapters: Plugin.ChapterItem[] = [];

        loadedCheerio(".series-chapterlist li").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a span")
                .first()
                .text()
                .replace(/.*?(Chapter.|[0-9])/g, "$1")
                .replace(/Bahasa Indonesia/g, "")
                .replace(/\s+/g, " ")
                .trim();

            const releaseDate = loadedCheerio(this)
                .find("a span")
                .first()
                .next()
                .text();
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
        const result = await fetchApi(chapterUrl);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio(".readerss").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}?s=${searchTerm}`;
        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".flexbox2-item").each(function () {
            const novelName = loadedCheerio(this)
                .find(".flexbox2-title span")
                .first()
                .text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this)
                .find(".flexbox2-content > a")
                .attr("href");

            if (!novelUrl) return;

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });

        return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

}

export default new SakuraNovel();
