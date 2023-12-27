
import { fetchApi, fetchFile } from "@libs/fetch";
import { Filters, FilterTypes } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { load as parseHTML } from "cheerio";
import { defaultCover } from "@libs/defaultCover";
import { NovelStatus } from "@libs/novelStatus";
import { parseMadaraDate } from "@libs/parseMadaraDate";
import dayjs from "dayjs";

interface MadaraOptionPath {
    genres?: string;
    novels?: string;
    novel?: string;
    chapter?: string;
}

const MadaraDefaultPath: MadaraOptionPath = {
    novels: "novel",
    novel: "novel",
    chapter: "novel",
};

interface MadaraOptions {
    useNewChapterEndpoint?: boolean;
    path?: MadaraOptionPath;
    lang?: string;
    orderBy?: string;
}

export interface MadaraMetadata {
    id: string;
    sourceSite: string;
    sourceName: string;
    options?: MadaraOptions;
    filters?: Filters;
}
class MadaraPlugin implements Plugin.PluginBase {
    id: string;
    name: string;
    icon: string;
    site: string;
    version: string;
    userAgent: string;
    cookieString: string;
    options?: MadaraOptions;
    filters?: Filters | undefined;

    constructor(metadata: MadaraMetadata) {
        this.id = metadata.id;
        this.name = metadata.sourceName + "[madara]";
        const iconFileName = metadata.sourceName
            .replace(/\s+/g, "")
            .toLowerCase();
        this.icon = `multisrc/madara/icons/${iconFileName}.png`;
        this.site = metadata.sourceSite;
        this.version = "1.0.0";
        this.userAgent = "";
        this.cookieString = "";
        this.options = metadata.options;
        this.filters = metadata.filters;
    }
    async popularNovels(
        pageNo: number,
        {
            filters,
            showLatestNovels,
        }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];

        let url = this.site;
        if (filters?.genres && this.options?.path?.genres) {
            url += this.options?.path?.genres + filters.genres;
        } else {
            url += this.options?.path?.novels
                ? this.options.path.novels
                : MadaraDefaultPath.novels;
        }

        url +=
            "/page/" +
            pageNo +
            "/" +
            "?m_orderby=" +
            (showLatestNovels ? "latest" : filters?.sort || "rating");

        const body = await fetchApi(url).then((res) => res.text());

        const loadedCheerio = parseHTML(body);

        loadedCheerio(".manga-title-badges").remove();

        loadedCheerio(".page-item-detail").each(function () {
            const novelName = loadedCheerio(this)
                .find(".post-title")
                .text()
                .trim();
            let image = loadedCheerio(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");

            let novelUrl =
                loadedCheerio(this)
                    .find(".post-title")
                    .find("a")
                    .attr("href") || "";
            const novel: Plugin.NovelItem = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        });

        return novels;
    }
    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const novel: Plugin.SourceNovel = {
            url: novelUrl,
        };

        const body = await fetchApi(novelUrl).then((res) => res.text());

        let loadedCheerio = parseHTML(body);

        loadedCheerio(".manga-title-badges, #manga-title span").remove();
        novel.name =
            loadedCheerio(".post-title h1").text().trim() ||
            loadedCheerio("#manga-title h1").text();

        novel.cover =
            loadedCheerio(".summary_image > a > img").attr("data-lazy-src") ||
            loadedCheerio(".summary_image > a > img").attr("data-src") ||
            loadedCheerio(".summary_image > a > img").attr("src") ||
            defaultCover;

        loadedCheerio(".post-content_item, .post-content").each(function () {
            const detailName = loadedCheerio(this).find("h5").text().trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();

            switch (detailName) {
                case "Genre(s)":
                case "التصنيفات":
                    novel.genres = detail.replace(/[\\t\\n]/g, ",");
                    break;
                case "Author(s)":
                case "المؤلف":
                case "المؤلف (ين)":
                    novel.author = detail;
                    break;
                case "Status":
                case "الحالة":
                    novel.status =
                        detail.includes("OnGoing") || detail.includes("مستمرة")
                            ? NovelStatus.Ongoing
                            : NovelStatus.Completed;
                    break;
            }
        });

        loadedCheerio("div.summary__content .code-block,script").remove();
        novel.summary =
            loadedCheerio("div.summary__content").text().trim() ||
            loadedCheerio("#tab-manga-about").text().trim() ||
            loadedCheerio('.post-content_item h5:contains("Summary")')
                .next()
                .text()
                .trim();

        let html;

        if (this.options?.useNewChapterEndpoint !== true) {
            const novelId =
                loadedCheerio(".rating-post-id").attr("value") ||
                loadedCheerio("#manga-chapters-holder").attr("data-id") ||
                "";

            const formData = new FormData();
            formData.append("action", "manga_get_chapters");
            formData.append("manga", novelId);

            html = await fetchApi(this.site + "wp-admin/admin-ajax.php", {
                method: "POST",
                body: formData,
            }).then((res) => res.text());
        } else {
            html = await fetchApi(novelUrl + "ajax/chapters/", {
                method: "POST",
            }).then((res) => res.text());
        }

        if (html !== "0") {
            loadedCheerio = parseHTML(html);
        }

        const chapters: Plugin.ChapterItem[] = [];
        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();

            let releaseDate = null;
            releaseDate = loadedCheerio(this)
                .find("span.chapter-release-date")
                .text()
                .trim();

            if (releaseDate) {
                releaseDate = parseMadaraDate(releaseDate);
            } else {
                /**
                 * Insert current date
                 */

                releaseDate = dayjs().format("LL");
            }

            let chapterUrl = loadedCheerio(this).find("a").attr("href") || "";

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
        const body = await fetchApi(chapterUrl).then((res) => res.text());

        const loadedCheerio = parseHTML(body);
        const chapterText =
            loadedCheerio(".text-left").html() ||
            loadedCheerio(".text-right").html() ||
            loadedCheerio(".entry-content").html() ||
            "";

        return chapterText;
    }
    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];
        const url = this.site + "?s=" + searchTerm + "&post_type=wp-manga";

        const body = await fetchApi(url).then((res) => res.text());

        const loadedCheerio = parseHTML(body);

        loadedCheerio(".c-tabs-item__content").each(function () {
            const novelName = loadedCheerio(this)
                .find(".post-title")
                .text()
                .trim();

            let image = loadedCheerio(this).find("img");
            const novelCover = image.attr("data-src") || image.attr("src");

            let novelUrl =
                loadedCheerio(this)
                    .find(".post-title")
                    .find("a")
                    .attr("href") || "";
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
        return await fetchFile(url, {});
    }
}

const plugin = new MadaraPlugin({"id":"novel4up","sourceSite":"https://novel4up.com/","sourceName":"Novel4Up","filters":{"sort":{"label":"ترتيب حسب:","value":"","options":[{"label":"Default","value":""},{"label":"أ-ي","value":"alphabet"},{"label":"الأحدث","value":"latest"},{"label":"الأكثر مشاهدة","value":"views"},{"label":"التقييم","value":"rating"},{"label":"الجديد","value":"new-manga"},{"label":"الشائع","value":"trending"}],"type":FilterTypes.Picker},"genres":{"label":"التصنيفات","value":"","options":[{"label":"NONE","value":""},{"label":"أكشن","value":"action"},{"label":"الخارق للطبيعة","value":"supernatural"},{"label":"تاريخي","value":"historical"},{"label":"تحقيق","value":"detective"},{"label":"تراجيديا","value":"tragedy"},{"label":"حريم","value":"harem"},{"label":"حياة مدرسية","value":"school-life"},{"label":"خيال علمي","value":"sci-fi"},{"label":"دراما","value":"drama"},{"label":"رعب","value":"horror"},{"label":"رومانسي","value":"romance"},{"label":"رياضة","value":"sports"},{"label":"سحر","value":"magic"},{"label":"شريحة من الحياة","value":"slice-of-life"},{"label":"شوانهوا","value":"xuanhuan"},{"label":"شوجو","value":"shoujo"},{"label":"شونين","value":"shounen"},{"label":"غموض","value":"mystery"},{"label":"فانتازيا","value":"fantasy"},{"label":"فنون قتال","value":"martial-arts"},{"label":"كوميديا","value":"comedy"},{"label":"مغامرة","value":"adventure"},{"label":"ميكا","value":"mecha"},{"label":"نفسي","value":"psychological"},{"label":"ون شوت","value":"one-shot"},{"label":"ووشيا","value":"wuxia"}],"type":FilterTypes.Picker}},"options":{"lang":"Arabic"}});
export default plugin;
    