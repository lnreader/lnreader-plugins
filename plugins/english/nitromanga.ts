import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class NitroManga implements Plugin.PluginBase {
    id = "nitromanga";
    name = "Nitro Manga";
    version = "1.0.0";
    icon = "src/en/nitromanga/icon.png";
    filters?: Filters | undefined;
    site = "https://nitromanga.com/";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const url = this.baseUrl + "mangas-genre/novel/?m_orderby=trending";

        const body = await fetchApi(url).then((r) => r.text());

        const loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".page-item-detail").each(function () {
            const novelName = loadedCheerio(this).find("h3 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

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

        loadedCheerio(".manga-title-badges.custom.novel").remove();

        novel.name = loadedCheerio(".post-title > h1").text().trim();
        novel.cover = loadedCheerio(".summary_image")
            .find("img")
            .attr("data-src");

        novel.summary = loadedCheerio(".summary__content").text()?.trim();

        novel.genres = loadedCheerio(".genres-content")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading")
                .text()
                .trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();
            switch (detailName) {
                case "Author(s)":
                    novel.author = detail;
                    break;
                case "Status":
                    novel.status = detail.replace(/G/g, "g");
                    break;
            }
        });
        let chapter: Plugin.ChapterItem[] = [];

        let chapterlisturl = novelUrl + "ajax/chapters/";

        const data = await fetchApi(chapterlisturl, { method: "POST" });
        const text = await data.text();

        loadedCheerio = parseHTML(text);

        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = loadedCheerio(this).find("span").text().trim();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) return;

            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapter.reverse();

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const body = await fetchApi(chapterUrl).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio(".text-left").html() || '';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = this.baseUrl + '?s=' + searchTerm + '&post_type=wp-manga&genre%5B%5D=novel';

        const body = await fetchApi(url).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".c-tabs-item__content").each(function () {
            const novelName = loadedCheerio(this).find("h3 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

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

export default new NitroManga();