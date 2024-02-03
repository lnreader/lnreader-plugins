import { CheerioAPI, load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import dayjs from "dayjs";
class Genesis implements Plugin.PluginBase {
    id = "genesistls";
    name = "GenesisTLs";
    icon = "src/en/genesistls/icon.png";
    site = "https://genesistls.com/";
    version = "1.0.0";
    parseNovels(loadedCheerio: CheerioAPI) {
        const novels: Plugin.NovelItem[] = [];
        loadedCheerio("article.bs").each(function () {
            const novelName = loadedCheerio(this).find(".ntitle").text().trim();
            let image = loadedCheerio(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");
            const novelUrl = loadedCheerio(this).find("a").attr("href");
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
    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let link = `${this.site}series/?page=${pageNo}`;
        if (filters.genres.value.length)
            link += filters.genres.value.map((i) => `&genre[]=${i}`).join("");
        if (filters.type.value.length)
            link += filters.type.value.map((i) => `&type[]=${i}`).join("");
        link += "&status=" + filters.status.value;
        link += "&order=" + filters.order.value;
        const body = await fetchApi(link).then((result) =>
            result.text()
        );
        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
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
        novel.name = loadedCheerio(".entry-title").text();
        novel.cover =
            loadedCheerio("img.wp-post-image").attr("data-src") ||
            loadedCheerio("img.wp-post-image").attr("src");
        loadedCheerio("div.spe > span").each(function () {
            const detailName = loadedCheerio(this).find("b").text().trim();
            const detail = loadedCheerio(this)
                .find("b")
                .remove()
                .end()
                .text()
                .trim();
            switch (detailName) {
                case "Author:":
                    novel.author = detail;
                    break;
                case "Status:":
                    novel.status = detail;
                    break;
            }
        });
        novel.genres = loadedCheerio(".genxed")
            .text()
            .trim()
            .replace(/\s/g, ",");
        loadedCheerio('div[itemprop="description"]  h3,p.a,strong').remove();
        novel.summary = loadedCheerio('div[itemprop="description"]')
            .find("br")
            .replaceWith("\n")
            .end()
            .text();
            let chapter: Plugin.ChapterItem[] = [];
            loadedCheerio(".eplister")
                .find("li")
                .each(function () {
                    const chapterUrl = loadedCheerio(this).find("a").attr("href");
                    if (!chapterUrl) return;
                    const chapterpaid = loadedCheerio(this).find('.epl-price').text();
                    if (chapterpaid !== "Free") return
                        const chapterName =
                        loadedCheerio(this).find(".epl-num").text() +
                        " - " +
                        loadedCheerio(this).find(".epl-title").text();
                    const releaseDate = loadedCheerio(this)
                        .find(".epl-date")
                        .text()
                        .trim();
            
                    if (!releaseDate) return;
            
                    chapter.push({
                        name: chapterName,

                        releaseTime: dayjs(releaseDate).toISOString(),

                        url: chapterUrl,
                    });
                });
            novel.chapters = chapter.reverse();
        return novel;

    }
        async parseChapter(chapterUrl: string): Promise<string> {
        const result = await fetchApi(chapterUrl);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
        let chapterText = loadedCheerio(".epcontent").html() || "";
        return chapterText;
    }
    async searchNovels(
        searchTerm: string,
        pageNo: number
    ): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}page/${pageNo}/?s=${searchTerm}`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return await fetchFile(url);
    }
    filters = {
        order: {
            label: "Sort By",
            options: [
                { label: "Default", value: "" },
                { label: "A-Z", value: "title" },
                { label: "Z-A", value: "titlereverse" },
                { label: "Latest Update", value: "update" },
                { label: "Latest Added", value: "latest" },
                { label: "Popular", value: "popular" },
            ],
            type: FilterTypes.Picker,
            value: "",
        },
        status: {
            label: "Status",
            options: [
                { label: "All", value: "" },
                { label: "Ongoing", value: "ongoing" },
                { label: "Hiatus", value: "hiatus" },
                { label: "Completed", value: "completed" },
            ],
            type: FilterTypes.Picker,
            value: "",
        },
        type: {
            label: "Type",
            options: [
                { label: "korean novel", value: "korean-novel" },
                { label: "Web Novel", value: "web-novel" },
            ],
            type: FilterTypes.CheckboxGroup,
            value: [],
        },
        genres: {
            label: "Genres",
            options: [

                { label: "Academy", value: "academy" },
                { label: "Action", value: "action" },
                { label: "Adult", value: "adult" },
                { label: "Adventure", value: "adventure" },
                { label: "Another World", value: "another-world" },
                { label: "Comdey", value: "comdey" },
                { label: "Comedy", value: "comedy" },
                { label: "Dark Fantasy", value: "dark-fantasy" },
                { label: "Drama", value: "drama" },
                { label: "Fantasy", value: "fantasy" },
                { label: "Fantasy Fusion", value: "fantasy-fusion" },
                { label: "Harem", value: "harem" },
                { label: "Historical", value: "historical" },
                { label: "Horror", value: "horror" },
                { label: "Hunter", value: "hunter" },
                { label: "Light Novel", value: "light-novel" },
                { label: "Martial Arts", value: "martial-arts" },
                { label: "Mature", value: "mature" },
                { label: "Misunderstanding", value: "misunderstanding" },
                { label: "Modern", value: "modern" },
                { label: "Munchkin", value: "munchkin" },
                { label: "Murim", value: "murim" },
                { label: "mystery", value: "mystery" },
                { label: "No Harem", value: "no-harem" },
                { label: "NO NTR", value: "no-ntr" },
                { label: "obsession", value: "obsession" },
                { label: "Possession", value: "possession" },
                { label: "Psychological", value: "psychological" },
                { label: "Regression", value: "regression" },
                { label: "Regret", value: "regret" },
                { label: "reincarnation", value: "reincarnation" },
                { label: "Romance", value: "romance" },
                { label: "School Life", value: "school-life" },
                { label: "Seinen", value: "seinen" },
                { label: "Slice of life", value: "slice-of-life" },
                { label: "Supernatural", value: "supernatural" },
                { label: "Tragedy", value: "tragedy" },
                { label: "Transmigrated to Game", value: "transmigrated-to-game" },
                { label: "Transmigration", value: "transmigration" },
            ],
            type: FilterTypes.CheckboxGroup,
            value: [],
        },
    } satisfies Filters;
}
export default new Genesis();

