import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";

class KolNovel implements Plugin.PluginBase {
    id = "kolnovel";
    name = "KolNovel";
    icon = "multisrc/wpmangastream/icons/kolnovel.png";
    site = "https://kolnovel.lol/";
    version = "1.0.0";
    userAgent = "";
    cookieString = "";
    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let link = `${this.site}series/?page=${pageNo}`;

        if (filters.genres.value.length)
            link += filters.genres.value.map((i) => `&genre[]=${i}`).join("");
        if (filters.type.value.length)
            link += filters.type.value.map((i) => `&lang[]=${i}`).join("");

        link += "&status=" + (filters?.status ? filters.status : "");

        link += "&order=" + (filters?.order ? filters.order : "popular");
        const headers = new Headers();
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
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
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
        const result = await fetch(url, { headers });
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

        loadedCheerio("div.serl:nth-child(3) > span").each(function () {
            const detailName = loadedCheerio(this).text().trim();
            const detail = loadedCheerio(this).next().text().trim();

            switch (detailName) {
                case "الكاتب":
                case "Author":
                    novel.author = detail;
                    break;
            }
        });

        novel.status = loadedCheerio("div.sertostat > span").attr("class");

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
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
        const result = await fetch(chapterUrl, { headers });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        loadedCheerio(".epcontent > div, i").remove();
        let ignore = loadedCheerio("article > style").text().trim().split(",");
        ignore.push(...(ignore.pop()?.match(/^\.\w+/) || []));
        ignore.map((tag) => loadedCheerio(`p${tag}`).remove());

        let chapterText = loadedCheerio(".epcontent").html() || "";

        return chapterText;
    }
    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}?s=${searchTerm}`;
        const headers = new Headers();
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
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
            label: "ترتيب حسب",
            options: [
                { label: "الإعداد الأولي", value: "" },

                { label: "A-Z", value: "title" },

                { label: "Z-A", value: "titlereverse" },

                { label: "أخر التحديثات", value: "update" },

                { label: "أخر ما تم إضافته", value: "latest" },

                { label: "الرائجة", value: "popular" },
            ],
            value: "",
            type: FilterTypes.Picker,
        },
        status: {
            value: "",
            label: "الحالة",
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
            label: "النوع",
            options: [
                { label: "إنجليزية", value: "english" },

                { label: "روايةلايت", value: "light-novel" },

                { label: "روايةويب", value: "web-novel" },

                { label: "صينية", value: "chinese" },

                { label: "عربية", value: "arabic" },

                { label: "كورية", value: "korean" },

                { label: "يابانية", value: "japanese" },
            ],
            type: FilterTypes.CheckboxGroup,
        },
        genres: {
            value: [],
            label: "تصنيف",
            options: [
                { label: "Wuxia", value: "wuxia" },

                { label: "Xianxia", value: "xianxia" },

                { label: "XUANHUAN", value: "xuanhuan" },

                { label: "أكشن", value: "action" },

                { label: "إثارة", value: "excitement" },

                { label: "إنتقالالىعالمأخر", value: "isekai" },

                { label: "إيتشي", value: "etchi" },

                { label: "الخيالالعلمي", value: "sci-fi" },

                { label: "بوليسي", value: "policy" },

                { label: "تاريخي", value: "historical" },

                { label: "تحقيقات", value: "%d8%aa%d8%ad%d9%82%d9%8a%d9%82" },

                { label: "تقمصشخصيات", value: "rpg" },

                { label: "جريمة", value: "crime" },

                { label: "جوسى", value: "josei" },

                { label: "حريم", value: "harem" },

                { label: "حياةمدرسية", value: "school-life" },

                { label: "خيالي(فانتازيا)", value: "fantasy" },

                { label: "دراما", value: "drama" },

                { label: "رعب", value: "horror" },

                { label: "رومانسي", value: "romantic" },

                { label: "سحر", value: "magic" },

                { label: "سينن", value: "senen" },

                { label: "شريحةمنالحياة", value: "slice-of-life" },

                { label: "شوجو", value: "shojo" },

                { label: "شونين", value: "shonen" },

                { label: "طبي", value: "medical" },

                { label: "ظواهرخارقةللطبيعة", value: "supernatural" },

                { label: "غموض", value: "mysteries" },

                { label: "فنونالقتال", value: "martial-arts" },

                { label: "قوىخارقة", value: "superpower" },

                { label: "كوميدي", value: "comedy" },

                { label: "مأساوي", value: "tragedy" },

                { label: "مابعدالكارثة", value: "after-the-disaster" },

                { label: "مغامرة", value: "adventure" },

                { label: "ميكا", value: "mechanical" },

                { label: "ناضج", value: "mature" },

                { label: "نفسي", value: "psychological" },
            ],
            type: FilterTypes.CheckboxGroup,
        },
    } satisfies Filters;
}

export default new KolNovel();
