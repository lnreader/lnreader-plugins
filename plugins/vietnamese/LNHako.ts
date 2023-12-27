import { CheerioAPI, load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { isUrlAbsolute } from "@libs/isAbsoluteUrl";
class HakoPlugin implements Plugin.PluginBase {
    id: string;
    name: string;
    icon: string;
    site: string;
    version: string;
    userAgent: string;
    cookieString: string;
    constructor() {
        this.id = "ln.hako";
        this.name = "Hako";
        this.icon = "src/vi/hakolightnovel/icon.png";
        this.site = "https://ln.hako.vn";
        this.version = "1.0.0";
        this.userAgent = "";
        this.cookieString = "";
    }
    parseNovels(loadedCheerio: CheerioAPI) {
        const novels: Plugin.NovelItem[] = [];
        loadedCheerio(".row > .thumb-item-flow").each((index, ele) => {
            let url = loadedCheerio(ele)
                .find("div.thumb_attr.series-title > a")
                .attr("href");

            if (url && !isUrlAbsolute(url)) {
                url = this.site + url;
            }

            if (url) {
                const name = loadedCheerio(ele)
                    .find(".series-title")
                    .text()
                    .trim();
                let cover = loadedCheerio(ele)
                    .find(".img-in-ratio")
                    .attr("data-bg");

                if (cover && !isUrlAbsolute(cover)) {
                    cover = this.site + cover;
                }

                const novel = { name, url, cover };

                novels.push(novel);
            }
        });
        return novels;
    }
    async popularNovels(
        pageNo: number,
        options: Plugin.PopularNovelsOptions
    ): Promise<Plugin.NovelItem[]> {
        const link =
            this.site +
            "/danh-sach?truyendich=1&sapxep=topthang&page=" +
            pageNo;
        const result = await fetch(link);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const novel: Plugin.SourceNovel = {
            url: novelUrl,
        };
        const result = await fetch(novelUrl);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        novel.name = loadedCheerio(".series-name").text();

        const background =
            loadedCheerio(".series-cover > .a6-ratio > div").attr("style") ||
            "";
        const novelCover = background.substring(
            background.indexOf("http"),
            background.length - 2
        );

        novel.cover = novelCover
            ? isUrlAbsolute(novelCover)
                ? novelCover
                : this.site + novelCover
            : "";

        novel.summary = loadedCheerio(".summary-content").text().trim();

        novel.author = loadedCheerio(
            "#mainpart > div:nth-child(2) > div > div:nth-child(1) > section > main > div.top-part > div > div.col-12.col-md-9 > div.series-information > div:nth-child(2) > span.info-value > a"
        )
            .text()
            .trim();

        novel.genres = loadedCheerio(".series-gernes")
            .text()
            .trim()
            .replace(/ +/g, " ")
            .split("\n")
            .filter((e) => e.trim())
            .join(", ");

        novel.status = loadedCheerio(
            "#mainpart > div:nth-child(2) > div > div:nth-child(1) > section > main > div.top-part > div > div.col-12.col-md-9 > div.series-information > div:nth-child(4) > span.info-value > a"
        )
            .text()
            .trim();

        const chapters: Plugin.ChapterItem[] = [];
        loadedCheerio(".list-chapters li").each((index, ele) => {
            let chapterUrl = loadedCheerio(ele).find("a").attr("href");

            if (chapterUrl && !isUrlAbsolute(chapterUrl)) {
                chapterUrl = this.site + chapterUrl;
            }

            if (chapterUrl) {
                const chapterName = loadedCheerio(ele)
                    .find(".chapter-name")
                    .text()
                    .trim();
                const releaseTime = loadedCheerio(ele)
                    .find(".chapter-time")
                    .text();

                const chapter = {
                    name: chapterName,
                    releaseTime: releaseTime,
                    url: chapterUrl,
                };

                chapters.push(chapter);
            }
        });
        novel.chapters = chapters;
        return novel;
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        const result = await fetch(chapterUrl);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio("#chapter-content").html() || "";

        return chapterText;
    }
    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const url = this.site + "/tim-kiem?keywords=" + searchTerm;
        const result = await fetch(url);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }
    async fetchImage(url: string): Promise<string | undefined> {
        const headers = {
            Referer: "https://ln.hako.vn",
        };
        return await fetchFile(url, { headers: headers });
    }
}

export default new HakoPlugin();
