import { CheerioAPI, load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";

class EarlyNovelPlugin implements Plugin.PluginBase {
    id = "earlynovel";
    name = "Early Novel";
    version = "1.0.0";
    icon = "multisrc/madara/icons/latestnovel.png";
    site = "https://earlynovel.net/";

    parseNovels(loadedCheerio: CheerioAPI){
        const novels: Plugin.NovelItem[] = [];

        loadedCheerio(".col-truyen-main > .list-truyen > .row").each(
            (i, el) => {
                const nUrl = loadedCheerio(el).find("h3.truyen-title > a").attr("href");

                const novelUrl = this.site + nUrl    
                const novelName = loadedCheerio(el)
                    .find("h3.truyen-title > a")
                    .text();
                const novelCover = loadedCheerio(el).find("img.cover").attr("src");
                console.log(novelCover);
    
                if (!nUrl) return;
                novels.push({
                    url: novelUrl,
                    name: novelName,
                    cover: novelCover,
                });
            }
        );
    
        return novels;
    };

    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let link = this.site;

        if (filters.genres.value.length)
            link += filters.genres.value;
        else
            link += filters.order.value;

        link += `?page=${pageNo}`;

        const headers = new Headers();
        const body = await fetchApi(link, { headers }).then((result) =>
            result.text()
        );
        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
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

        novel.name = loadedCheerio(".book > img").attr("alt");

        novel.cover = loadedCheerio(".book > img").attr("src");

        novel.summary = loadedCheerio(".desc-text").text().trim();

        loadedCheerio(".info > div > h3").each(function () {
            let detailName = loadedCheerio(this).text();
            let detail = loadedCheerio(this)
                .siblings()
                .map((i, el) => loadedCheerio(el).text())
                .toArray()
                .join(",");

            switch (detailName) {
                case "Author:":
                    novel.author = detail;
                    break;
                case "Status:":
                    novel.status = detail;
                    break;
                case "Genre:":
                    novel.genres = detail;
                    break;
            }
        });

        //! Doesn't work since there are multiple pages and can't find source API
        //# Since cannot find sourceAPI i try similar function to lightnovelpub
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

        const lastPageStr = loadedCheerio('a:contains("Last ")')
            .attr("title")
            ?.match(/(\d+)/g);
        const lastPage = Number(lastPageStr?.[1] || "0");

        const getChapters = async () => {
            const chapter: Plugin.ChapterItem[] = [];
            for (let i = 1; i <= lastPage; i++) {
                const chaptersUrl = `${novelUrl}?page=${i}`;
                const data = await fetchApi(chaptersUrl, { headers });
                const chapters = await data.text();
    
                loadedCheerio = parseHTML(chapters);

                loadedCheerio("ul.list-chapter > li").each((i,el) => {
                    const chapterName = loadedCheerio(el)
                        .find(".chapter-text")
                        .text()
                        .trim();
                    const releaseDate = null;
                    const cUrl = loadedCheerio(el)
                        .find("a")
                        .attr("href")
                        ?.slice(1);
                    if (!cUrl) return;
                    const chapterUrl = this.site + cUrl;

                    chapter.push({
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    });
                });

                await delay(1000);
            }

            return chapter;
        }

        novel.chapters = await getChapters();

        return novel;
    };

    async parseChapter(chapterUrl: string): Promise<string> {
        const headers = new Headers();
        const result = await fetchApi(chapterUrl, { headers });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio("#chapter-c").html() || "";

        return chapterText;
    };

    async searchNovels(
        searchTerm: string,
        pageNo: number
    ): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}search?keyword=${searchTerm}`;
        const headers = new Headers();
        const result = await fetchApi(url, { headers });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    };

    async fetchImage(url: string): Promise<string | undefined> {
        return await fetchFile(url);
    }

    filters = {
        order: {
            value: "/most-popular",
            label: "Order by",
            options: [
                { label: "Latest Release", value: "/latest-release-novel" },
                { label: "Hot Novel", value: "/hot-novel" },
                { label: "Completed Novel", value: "/completed-novel" },
                { label: "Most Popular", value: "/most-popular" },
            ],
            type: FilterTypes.Picker,
        },
        genres: {
            value: "",
            label: "Genre",
            options: [
                { label: "None", value: "" },
                { label: "Action", value: "/genre/action-1" },
                { label: "Adult", value: "/genre/adult-2" },
                { label: "Adventure", value: "/genre/adventure-3" },
                { label: "Comedy", value: "/genre/comedy-4" },
                { label: "Drama", value: "/genre/drama-5" },
                { label: "Ecchi", value: "/genre/ecchi-6" },
                { label: "Fantasy", value: "/genre/fantasy-7" },
                { label: "Gender Bender", value: "/genre/gender-bender-8" },
                { label: "Harem", value: "/genre/harem-9" },
                { label: "Historical", value: "/genre/historical-10" },
                { label: "Horror", value: "/genre/horror-11" },
                { label: "Josei", value: "/genre/josei-12" },
                { label: "Martial Arts", value: "/genre/martial-arts-13" },
                { label: "Mature", value: "/genre/mature-14" },
                { label: "Mecha", value: "/genre/mecha-15" },
                { label: "Mystery", value: "/genre/mystery-16" },
                { label: "Psychological", value: "/genre/psychological-17" },
                { label: "Romance", value: "/genre/romance-18" },
                { label: "School Life", value: "/genre/school-life-19" },
                { label: "Sci-fi", value: "/genre/sci-fi-20" },
                { label: "Seinen", value: "/genre/seinen-21" },
                { label: "Shoujo", value: "/genre/shoujo-22" },
                { label: "Shoujo Ai", value: "/genre/shoujo-ai-23" },
                { label: "Shounen", value: "/genre/shounen-24" },
                { label: "Shounen Ai", value: "/genre/shounen-ai-25" },
                { label: "Slice of Life", value: "/genre/slice-of-life-26" },
                { label: "Smut", value: "/genre/smut-27" },
                { label: "Sports", value: "/genre/sports-28" },
                { label: "Supernatural", value: "/genre/supernatural-29" },
                { label: "Tragedy", value: "/genre/tragedy-30" },
                { label: "Wuxia", value: "/genre/wuxia-31" },
                { label: "Xianxia", value: "/genre/xianxia-32" },
                { label: "Xuanhuan", value: "/genre/xuanhuan-33" },
                { label: "Yaoi", value: "/genre/yaoi-34" },
                { label: "Yuri", value: "/genre/yuri-35" },
                { label: "Video Games", value: "/genre/video-games-36" },
                { label: "Magical Realism", value: "/genre/magical-realism-37" },
            ],
            type: FilterTypes.Picker,
        },
    } satisfies Filters;
}

export default new EarlyNovelPlugin();