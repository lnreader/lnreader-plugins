import { fetchFile, fetchApi } from "@libs/fetch";
import { Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { NovelStatus } from "@libs/novelStatus";
import { load as parseHTML } from "cheerio";
import { parseMadaraDate } from "@libs/parseMadaraDate";
// import { defaultCover } from "@libs/defaultCover";

export interface ReadwnMetadata {
    id: string;
    sourceSite: string;
    sourceName: string;
    filters?: Filters;
}

class ReadwnPlugin implements Plugin.PluginBase {
    id: string;
    name: string;
    icon: string;
    site: string;
    version: string;
    userAgent: string;
    cookieString: string;
    filters?: Filters | undefined;

    constructor(metadata: ReadwnMetadata) {
        this.id = metadata.id;
        this.name = metadata.sourceName + "[readwn]";
        const iconFileName = metadata.sourceName
            .replace(/\s+/g, "")
            .toLowerCase();
        this.icon = `multisrc/readwn/icons/${iconFileName}.png`;
        this.site = metadata.sourceSite;
        this.version = "1.0.0";
        this.userAgent = "";
        this.cookieString = "";
        this.filters = metadata.filters;
    }

    async popularNovels(
        pageNo: number,
        { filters, showLatestNovels }: Plugin.PopularNovelsOptions
    ): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];
        const baseUrl = this.site;

        let url = baseUrl + "/list/";
        url += (filters?.genres || "all") + "/";
        url += (filters?.status || "all") + "-";
        url +=
            (showLatestNovels ? "lastdotime" : filters?.sort || "newstime") +
            "-";
        url += pageNo - 1 + ".html";

        if (filters?.tags) {
            url = baseUrl + "/tags/" + filters.tags + "-0.html";
        }

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);
        loadedCheerio("li.novel-item").each(function () {
            const name = loadedCheerio(this).find("h4").text();
            const url = loadedCheerio(this).find("a").attr("href");
            const cover = loadedCheerio(this)
                .find(".novel-cover > img")
                .attr("data-src");
            if (!name || !url) return;

            novels.push({
                name: name,
                cover: baseUrl + cover,
                url: baseUrl + url,
            });
        });

        return novels;
    }

    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const baseUrl = this.site;
        const result = await fetchApi(novelUrl);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);
        const novel: Plugin.SourceNovel = {
            url: novelUrl,
        };

        novel.name = loadedCheerio("h1.novel-title").text();
        novel.author = loadedCheerio("span[itemprop=author]").text();
        novel.cover =
            baseUrl + loadedCheerio("figure.cover > img").attr("data-src");

        novel.summary = loadedCheerio(".summary")
            .text()
            .replace("Summary", "")
            .trim();

        novel.genres = loadedCheerio("div.categories > ul > li")
            .map((index, element) => loadedCheerio(element).text()?.trim())
            .get()
            .join(",");

        loadedCheerio("div.header-stats > span").each(function () {
            if (loadedCheerio(this).find("small").text() === "Status") {
                novel.status = loadedCheerio(this).find("strong").text();
            }
        });

        const chapters: Plugin.ChapterItem[] = [];
        const latestChapterNo = parseInt(
            loadedCheerio(".header-stats")
                .find("span > strong")
                .first()
                .text()
                .trim()
        );

        let lastChapterNo = 1;
        loadedCheerio(".chapter-list li").each(function () {
            const name = loadedCheerio(this)
                .find("a .chapter-title")
                .text()
                .trim();
            const url = loadedCheerio(this).find("a").attr("href")?.trim();
            const releaseTime = loadedCheerio(this)
                .find("a .chapter-update")
                .text()
                .trim();
            lastChapterNo = parseInt(
                loadedCheerio(this).find("a .chapter-no").text().trim()
            );
            if (!name || !url) return;

            chapters.push({
                name,
                releaseTime: parseMadaraDate(releaseTime),
                url: baseUrl + url,
            });
        });
        const novelId =
            "/" + novelUrl.replace(".html", "").replace(this.site, "") + "_";

        // Itterate once more before loop to finish off
        lastChapterNo++;
        for (let i = lastChapterNo; i <= latestChapterNo; i++) {
            const name = "Chapter " + i;
            const releaseTime = null;
            const url = baseUrl + novelId + i + ".html";

            chapters.push({ name, releaseTime, url });
        }

        novel.chapters = chapters;
        return novel;
    }

    async parseChapter(chapterUrl: string): Promise<string> {
        const result = await fetchApi(chapterUrl);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio(".chapter-content").html();
        return chapterText || "";
    }

    async searchNovels(
        searchTerm: string
        //page: number | undefined = 1,
    ): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];
        const baseUrl = this.site;
        const searchUrl = baseUrl + "/e/search/index.php";

        const result = await fetchApi(searchUrl, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: baseUrl + "search.html",
                Origin: baseUrl,
                "user-agent":
                    this.userAgent ||
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
            },
            method: "POST",
            body: JSON.stringify({
                show: "title",
                tempid: 1,
                tbname: "news",
                keyboard: searchTerm,
            }),
        });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);
        loadedCheerio("li.novel-item").each(function () {
            const name = loadedCheerio(this).find("h4").text();
            const url = loadedCheerio(this).find("a").attr("href");
            const cover = loadedCheerio(this).find("img").attr("data-src");
            if (!name || !url) return;

            novels.push({ name, cover: baseUrl + cover, url: baseUrl + url });
        });

        return novels;
    }

    fetchImage = fetchFile;
}
