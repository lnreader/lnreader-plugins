import { CheerioAPI, load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Filters, FilterTypes } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";

class NovelUpdates implements Plugin.PluginBase {
    id = "novelupdates";
    name = "Novel Updates";
    version = "0.5.0";
    icon = "src/en/novelupdates/icon.png";
    site = "https://www.novelupdates.com/";

    parseNovels(loadedCheerio: CheerioAPI){
        const novels: Plugin.NovelItem[] = [];

        loadedCheerio("div.search_main_box_nu").each((idx, ele) => {
            const novelCover = loadedCheerio(ele).find("img").attr("src");
            const novelName = loadedCheerio(ele).find(".search_title > a").text();
            const novelUrl = loadedCheerio(ele)
                .find(".search_title > a")
                .attr("href");

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

    async popularNovels(page: number, { showLatestNovels, filters }: Plugin.PopularNovelsOptions<typeof this.filters>): Promise<Plugin.NovelItem[]> {
        let link = `${this.site}`;
        if (filters.language.value.length ||
            filters.novelType.value.length ||
            filters.genres.value.include?.length ||
            filters.genres.value.exclude?.length ||
            filters.storyStatus.value.length ){
        link += "series-finder/?sf=1"
        } else if (showLatestNovels){
            link += "latest-series/?st=1" 
            } else {
            link += "series-ranking/?rank=week"
            };
        
        if (filters.language.value.length)
            link += '&org=' + filters.language.value.join(',');
        
        if (filters.novelType.value.length)
            link += '&nt=' + filters.novelType.value.join(',');

        if (filters.genres.value.include?.length)
            link += '&gi=' + filters.genres.value.include.join(',');

        if (filters.genres.value.exclude?.length)
            link += '&ge=' + filters.genres.value.exclude.join(',');

        if (filters.genres.value.include?.length || filters.genres.value.exclude?.length)
            link += '&mgi=' + filters.genre_operator.value;

        if (filters.storyStatus.value.length)
            link += '&ss=' + filters.storyStatus.value;

        link += '&sort=' + filters.sort.value;

        link += '&order=' + filters.order.value;

        link += '&pg=' + page;

        const headers = new Headers();
        const body = await fetchApi(link, { headers }).then((result) =>
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

        novel.name = loadedCheerio(".seriestitlenu").text();

        novel.cover = loadedCheerio(".seriesimg > img").attr("src");

        novel.author = loadedCheerio("#showauthors").text().trim();

        novel.genres = loadedCheerio("#seriesgenre")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");
        novel.status = loadedCheerio("#editstatus").text().includes("Ongoing")
            ? "Ongoing"
            : "Completed";

        let type = loadedCheerio("#showtype").text().trim();

        let summary = loadedCheerio("#editdescription").text().trim();

        novel.summary = summary + `\n\nType: ${type}`;

        let chapter: Plugin.ChapterItem[] = [];

        const novelId = loadedCheerio("input#mypostid").attr("value")!;

        let formData = new FormData();
        formData.append("action", "nd_getchapters");
        formData.append("mygrr", "0");
        formData.append("mypostid", novelId);

        let link = `${this.site}wp-admin/admin-ajax.php`;

        const text = await fetchApi(
            link,
            {
                method: "POST",
                body: formData,
            },
        ).then((data) => data.text());

        loadedCheerio = parseHTML(text);

        loadedCheerio("li.sp_li_chp").each(function () {
            const chapterName = loadedCheerio(this).text().trim();

            const releaseDate = null;

            const chapterUrl =
                "https:" +
                loadedCheerio(this).find("a").first().next().attr("href");

            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapter.reverse();

        return novel;
    }
    getLocation(href: string) {
        var match = href.match(
            /^(https?:)\/\/(([^:/?#]*)(?::([0-9]+))?)([/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/
        );
        return match && `${match[1]}//${match[3]}`;
    }

    async parseChapter(chapterUrl: string): Promise<string> {
        let chapterText = "";

        const result = await fetchApi(
            chapterUrl,
        );
        const body = await result.text();

        // console.log(result.chapterUrl);

        // console.log('Redirected URL: ', result.chapterUrl);

        const loadedCheerio = parseHTML(body);

        let isWuxiaWorld = chapterUrl.toLowerCase().includes("wuxiaworld");

        let isBlogspot = chapterUrl.toLowerCase().includes("blogspot");

        let isTumblr = chapterUrl.toLowerCase().includes("tumblr");

        let isWattpad = chapterUrl.toLowerCase().includes("wattpad");

        let isLightNovelsTls = chapterUrl
            .toLowerCase()
            .includes("lightnovelstranslations");

        let isiNovelTranslation = chapterUrl
            .toLowerCase()
            .includes("inoveltranslation");

        let isTravisTranslation = chapterUrl
            .toLowerCase()
            .includes("travistranslations");

        /**
         * Checks if its a wordpress site
         */
        let isWordPressStr =
            loadedCheerio('meta[name="generator"]').attr("content") ||
            loadedCheerio("footer").text();

        let isWordPress = false;

        if (isWordPressStr) {
            isWordPress =
                isWordPressStr.toLowerCase().includes("wordpress") ||
                isWordPressStr.includes("Site Kit by Google") ||
                loadedCheerio(".powered-by")
                    .text()
                    .toLowerCase()
                    .includes("wordpress");
        }

        let isRainOfSnow = chapterUrl.toLowerCase().includes("rainofsnow");

        let isWebNovel = chapterUrl.toLowerCase().includes("webnovel");

        let isHostedNovel = chapterUrl.toLowerCase().includes("hostednovel");

        let isScribbleHub = chapterUrl.toLowerCase().includes("scribblehub");

        if (isWuxiaWorld) {
            chapterText = loadedCheerio("#chapter-content").html()!;
        } else if (isRainOfSnow) {
            chapterText = loadedCheerio("div.content").html()!;
        } else if (isTumblr) {
            chapterText = loadedCheerio(".post").html()!;
        } else if (isBlogspot) {
            loadedCheerio(".post-share-buttons").remove();
            chapterText = loadedCheerio(".entry-content").html()!;
        } else if (isHostedNovel) {
            chapterText = loadedCheerio(".chapter").html()!;
        } else if (isScribbleHub) {
            chapterText = loadedCheerio("div.chp_raw").html()!;
        } else if (isWattpad) {
            chapterText = loadedCheerio(".container  pre").html()!;
        } else if (isTravisTranslation) {
            chapterText = loadedCheerio(".reader-content").html()!;
        } else if (isLightNovelsTls) {
            chapterText = loadedCheerio(".text_story").html()!;
        } else if (isiNovelTranslation) {
            chapterText = loadedCheerio(".chakra-skeleton").html()!;
        } else if (isWordPress) {
            /**
             * Remove wordpress bloat tags
             */

            const bloatClasses = [
                ".c-ads",
                "#madara-comments",
                "#comments",
                ".content-comments",
                ".sharedaddy",
                ".wp-dark-mode-switcher",
                ".wp-next-post-navi",
                ".wp-block-buttons",
                ".wp-block-columns",
                ".post-cats",
                ".sidebar",
                ".author-avatar",
                ".ezoic-ad",
            ];

            bloatClasses.map((tag) => loadedCheerio(tag).remove());

            chapterText =
                loadedCheerio(".entry-content").html() ||
                loadedCheerio(".single_post").html() ||
                loadedCheerio(".post-entry").html() ||
                loadedCheerio(".main-content").html() ||
                loadedCheerio("article.post").html() ||
                loadedCheerio(".content").html() ||
                loadedCheerio("#content").html() ||
                loadedCheerio(".page-body").html() ||
                loadedCheerio(".td-page-content").html()!;
        } else if (isWebNovel) {
            chapterText = loadedCheerio(".cha-words").html()!;

            if (!chapterText) {
                chapterText = loadedCheerio("._content").html()!;
            }
        } else {
            /**
             * Remove unnecessary tags
             */
            const tags = ["nav", "header", "footer", ".hidden"];

            tags.map((tag) => loadedCheerio(tag).remove());

            chapterText = loadedCheerio("body").html()!;
        }

        if (chapterText) {
            /**
             * Convert relative urls to absolute
             */
            chapterText = chapterText.replace(
                /href="\//g,
                `href="${this.getLocation(chapterUrl)}/`
            );
        }

        return chapterText;
    }
    async searchNovels(searchTerm: string, page: number): Promise<Plugin.NovelItem[]> {
        const url =`${this.site}page/${page}/?s=${searchTerm}&post_type=seriesplans`;
        const headers = new Headers();
        const result = await fetchApi(url, { headers });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);
        return this.parseNovels(loadedCheerio);
    }

    fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

    filters = {
        sort: {
            label: "Sort Results By",
            value: "sdate",
            options: [
                { label: "Last Updated", value: "sdate" },
                { label: "Rating", value: "srate" },
                { label: "Rank", value: "srank" },
                { label: "Reviews", value: "sreview" },
                { label: "Chapters", value: "srel" },
                { label: "Title", value: "abc" },
                { label: "Readers", value: "sread" },
                { label: "Frequency", value: "sfrel" },
            ],
            type: FilterTypes.Picker,
        },
        order: {
            label: "Order",
            value: "desc",
            options: [
                { label: "Descending", value: "desc" },
                { label: "Ascending", value: "asc" },
            ],
            type: FilterTypes.Picker,
        },
        storyStatus: {
            label: "Story Status (Translation)",
            value: "",
            options: [
                { label: "All", value: "" },
                { label: "Completed", value: "2" },
                { label: "Ongoing", value: "3" },
                { label: "Hiatus", value: "4" },
            ],
            type: FilterTypes.Picker,
        },
        language: {
            label: "Language",
            value: [],
            options: [
                { label: "None", value: "" },
                { label: "Chinese", value: "495" },
                { label: "Filipino", value: "9181" },
                { label: "Indonesian", value: "9179" },
                { label: "Japanese", value: "496" },
                { label: "Khmer", value: "18657" },
                { label: "Korean", value: "497" },
                { label: "Malaysian", value: "9183" },
                { label: "Thai", value: "9954" },
                { label: "Vietnamese", value: "9177" },
            ],
            type: FilterTypes.CheckboxGroup,
        },
        novelType: {
            label: "Novel Type",
            value: [],
            options: [
                { label: "Light Novel", value: "2443" },
                { label: "Published Novel", value: "26874" },
                { label: "Web Novel", value: "2444" },
            ],
            type: FilterTypes.CheckboxGroup,
        },
        genres: {
            label: "Genres",
            type: FilterTypes.ExcludableCheckboxGroup,
            value: {
                include: [],
                exclude: [],
            },
            options: [
                { label: "Action", value: "8" },
                { label: "Adult", value: "280" },
                { label: "Adventure", value: "13" },
                { label: "Comedy", value: "17" },
                { label: "Drama", value: "9" },
                { label: "Ecchi", value: "292" },
                { label: "Fantasy", value: "5" },
                { label: "Gender Bender", value: "168" },
                { label: "Harem", value: "3" },
                { label: "Historical", value: "330" },
                { label: "Horror", value: "343" },
                { label: "Josei", value: "324" },
                { label: "Martial Arts", value: "14" },
                { label: "Mature", value: "4" },
                { label: "Mecha", value: "10" },
                { label: "Mystery", value: "245" },
                { label: "Psychoical", value: "486" },
                { label: "Romance", value: "15" },
                { label: "School Life", value: "6" },
                { label: "Sci-fi", value: "11" },
                { label: "Seinen", value: "18" },
                { label: "Shoujo", value: "157" },
                { label: "Shoujo Ai", value: "851" },
                { label: "Shounen", value: "12" },
                { label: "Shounen Ai", value: "1692" },
                { label: "Slice of Life", value: "7" },
                { label: "Smut", value: "281" },
                { label: "Sports", value: "1357" },
                { label: "Supernatural", value: "16" },
                { label: "Tragedy", value: "132" },
                { label: "Wuxia", value: "479" },
                { label: "Xianxia", value: "480" },
                { label: "Xuanhuan", value: "3954" },
                { label: "Yaoi", value: "560" },
                { label: "Yuri", value: "922" },
            ],
        },
        genre_operator: {
            label: "Genre (AND/OR)",
            value: "and",
            options: [
                { label: "AND", value: "and" },
                { label: "OR", value: "or" },
            ],
            type: FilterTypes.Picker,
        },
    } satisfies Filters;
}

export default new NovelUpdates();
