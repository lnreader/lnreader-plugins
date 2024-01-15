import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";

class PandaMTL implements Plugin.PluginBase {
    id = "pandamtl";
    name = "PandaMTL";
    icon = "src/en/wordpress/icon.png";
    site = "https://pandamtl.com/";
    version = "1.0.0";
    userAgent = "";
    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let link = `${this.site}series/?page=${pageNo}`;

        if (filters.genres.value.length) {
            link += filters.genres.value.map((i) => `&genre[]=${i}`).join("");
        }

        if (filters.type.value.length)
            link += filters.type.value.map((i) => `&lang[]=${i}`).join("");

        link += "&status=" + (filters?.status ? filters.status : "");

        link += "&order=" + (filters?.order ? filters.order : "popular");

        const headers = new Headers();
        const body = await fetchApi(link, { headers }).then((result) =>
            result.text()
        );

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio("article.maindet").each(function () {
            const novelName = loadedCheerio(this).find("h2").text();
            let image = loadedCheerio(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");
            const novelUrl = loadedCheerio(this).find("h2 a").attr("href");

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
        const headers = new Headers();
        const result = await fetchApi(url, { headers });
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("h1.entry-title").text();

        novel.cover =
            loadedCheerio("img.wp-post-image").attr("data-src") ||
            loadedCheerio("img.wp-post-image").attr("src");

        loadedCheerio(".serl:nth-child(3) > span").each(function () {
            const detailName = loadedCheerio(this).text().trim();
            const detail = loadedCheerio(this).next().text().trim();

            switch (detailName) {
                case "Author":
                    novel.author = detail;
                    break;
            }
        });

        novel.status = loadedCheerio(".sertostat > span").attr("class");

        novel.genres = loadedCheerio(".sertogenre")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        novel.summary = loadedCheerio(".sersys")
            .find("br")
            .replaceWith("\n")
            .end()
            .text();

        let chapter: Plugin.ChapterItem[] = [];

        loadedCheerio(".eplister")
            .find("li")
            .each(function () {
                const chapterName =
                    loadedCheerio(this).find(".epl-num").text() +
                    " - " +
                    loadedCheerio(this).find(".epl-title").text();

                const releaseDate = loadedCheerio(this)
                    .find(".epl-date")
                    .text()
                    .trim();

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
        const headers = new Headers();
        const result = await fetchApi(chapterUrl, { headers });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        let chapterText = loadedCheerio(".epcontent").html() || "";

        return chapterText;
    }
    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}?s=${searchTerm}`;
        const headers = new Headers();
        const result = await fetchApi(url, { headers });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio("article.maindet").each(function () {
            const novelName = loadedCheerio(this).find("h2").text();
            let image = loadedCheerio(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");
            const novelUrl = loadedCheerio(this).find("h2 a").attr("href");

            if (!novelUrl) return;

            novels.push({
                name: novelName,
                url: novelUrl,
                cover: novelCover,
            });
        });

        return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return await fetchFile(url);
    }

    filters = {
        order: {
            label: "Sort By",
            value: "",
            options: [
                { label: "Default", value: "" },

                { label: "A-Z", value: "title" },

                { label: "Z-A", value: "titlereverse" },

                { label: "Latest Update", value: "update" },

                { label: "Latest Added", value: "latest" },

                { label: "Popular", value: "popular" },
            ],
            type: FilterTypes.Picker,
        },
        status: {
            label: "Status",
            value: "",
            options: [
                { label: "All", value: "" },

                { label: "Ongoing", value: "ongoing" },

                { label: "Hiatus", value: "hiatus" },

                { label: "Completed", value: "completed" },
            ],
            type: FilterTypes.Picker,
        },
        type: {
            value: [],
            label: "Type",
            options: [
                { label: "Light Novel (KR)", value: "light-novel-kr" },

                { label: "Web Novel", value: "web-novel" },
            ],
            type: FilterTypes.CheckboxGroup,
        },
        genres: {
            label: "Genres",
            value: [],
            options: [
                { label: "Action", value: "action" },

                { label: "Adult", value: "adult" },

                { label: "Adventure", value: "adventure" },

                { label: "Comedy", value: "comedy" },

                { label: "Ecchi", value: "ecchi" },

                { label: "Fantasy", value: "fantasy" },

                { label: "Harem", value: "harem" },

                { label: "Josei", value: "josei" },

                { label: "Martial Arts", value: "martial-arts" },

                { label: "Mature", value: "mature" },

                { label: "Romance", value: "romance" },

                { label: "School Life", value: "school-life" },

                { label: "Sci-fi", value: "sci-fi" },

                { label: "Seinen", value: "seinen" },

                { label: "Slice of Life", value: "slice-of-life" },

                { label: "Smut", value: "smut" },

                { label: "Sports", value: "sports" },

                { label: "Supernatural", value: "supernatural" },

                { label: "Tragedy", value: "tragedy" },
            ],
            type: FilterTypes.CheckboxGroup,
        },
    } satisfies Filters;
}

export default new PandaMTL();
