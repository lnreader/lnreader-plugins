import { load as cheerioload } from "cheerio";
import { Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";
import { fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";

class BLN implements Plugin.PluginBase {
    id = "BLN.com";
    name = "BestLightNovel";
    icon = "src/en/bestlightnovel/icon.png";
    site = "https://bestlightnovel.com/";
    filter?: undefined;
    version = "1.0.0";
    userAgent = "";
    async popularNovels(
        pageNo: number,
        options: Plugin.PopularNovelsOptions
    ): Promise<Plugin.NovelItem[]> {
        const url =
            this.site +
            "novel_list?type=topview&category=all&state=all&page=1" +
            pageNo;

        const result = await fetch(url);
        if (!result.ok) {
            console.error(await result.text());
            // TODO: Cloudflare protection or other error
            return [];
        }
        const body = await result.text();

        const loadedCheerio = cheerioload(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".update_item.list_category").each(function () {
            const novelName = loadedCheerio(this).find("h3 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

            if (!novelUrl) {
                // TODO: Handle error
                console.error("No novel url!");
                return;
            }

            const novel = {
                name: novelName,
                url: novelUrl,
                cover: novelCover,
            };

            novels.push(novel);
        });

        return novels;
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const url = novelUrl;

        const result = await fetch(url);
        if (!result.ok) {
            console.error(await result.text());
            // TODO: Cloudflare protection
            return { url, chapters: [] };
        }
        const body = await result.text();

        let loadedCheerio = cheerioload(body);

        let novel: Plugin.SourceNovel = {
            url,
            name: "",
            cover: "",
            author: "",
            status: NovelStatus.Unknown,
            genres: "",
            summary: "",
            chapters: [],
        };

        novel.name = loadedCheerio(".truyen_info_right  h1").text().trim();
        novel.cover =
            loadedCheerio(".info_image img").attr("src") || defaultCover;
        novel.summary = loadedCheerio("#noidungm").text()?.trim();
        novel.author = loadedCheerio(
            "#main_body > div.cotgiua > div.truyen_info_wrapper > div.truyen_info > div.entry-header > div.truyen_if_wrap > ul > li:nth-child(2) > a"
        )
            .text()
            ?.trim();

        let status = loadedCheerio(
            "#main_body > div.cotgiua > div.truyen_info_wrapper > div.truyen_info > div.entry-header > div.truyen_if_wrap > ul > li:nth-child(4) > a"
        )
            .text()
            ?.trim();

        novel.status =
            status === "ONGOING"
                ? NovelStatus.Ongoing
                : status === "COMPLETED"
                ? NovelStatus.Completed
                : NovelStatus.Unknown;

        let novelChapters: Plugin.ChapterItem[] = [];

        loadedCheerio(".chapter-list div.row").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = loadedCheerio(this)
                .find("span:nth-child(2)")
                .text()
                .trim();
            const chapterUrl = loadedCheerio(this).find("a").attr("href");

            if (!chapterUrl) {
                // TODO: Handle error
                console.error("No chapter url!");
                return;
            }

            novelChapters.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = novelChapters.reverse();

        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const url = chapterUrl;

        const result = await fetch(url);
        const body = await result.text();

        let loadedCheerio = cheerioload(body);

        const chapterText = loadedCheerio("#vung_doc").html() || "";

        return chapterText;
    }
    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}search_novels/${searchTerm}`;

        const result = await fetch(url);
        const body = await result.text();

        let loadedCheerio = cheerioload(body);

        let novels: Plugin.NovelItem[] = [];

        loadedCheerio(".update_item.list_category").each(function () {
            const novelName = loadedCheerio(this).find("h3 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("src");
            const novelUrl = loadedCheerio(this).find("h3 > a").attr("href");

            if (!novelUrl) {
                // TODO: Handle error
                console.error("No novel url!");
                return;
            }

            const novel = { name: novelName, cover: novelCover, url: novelUrl };

            novels.push(novel);
        });

        return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return await fetchFile(url);
    }
}

export default new BLN();
