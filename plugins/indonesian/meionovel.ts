import { Plugin } from "@typings/plugin";
import { fetchApi } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { load as parseHTML } from "cheerio";
import { defaultCover } from "@libs/defaultCover";
import { FilterTypes, Filters } from "@libs/filterInputs";

class Meionovel implements Plugin.PluginBase {
    id = "meionovel";
    name = "Meionovel";
    icon = "src/id/meionovel/icon.png";
    site = "https://meionovels.com";
    version = "1.0.0";

    filters = {
        order: {
            value: "popular",
            label: "Urutkan",
            type: FilterTypes.Picker,
            options: [
                { label: "Populer", value: "popular" },
                { label: "Terbaru", value: "latest" },
                { label: "A-Z", value: "alphabet" },
                { label: "Rating", value: "rating" },
            ],
        },
        genre: {
            value: "",
            label: "Genre",
            type: FilterTypes.Picker,
            options: [
                { label: "Semua", value: "" },
                { label: "Action", value: "action" },
                { label: "Adventure", value: "adventure" },
                { label: "Comedy", value: "comedy" },
                { label: "Drama", value: "drama" },
                { label: "Fantasy", value: "fantasy" },
                { label: "Harem", value: "harem" },
                { label: "Isekai", value: "isekai" },
                { label: "Mystery", value: "mystery" },
                { label: "Romance", value: "romance" },
                { label: "Sci-fi", value: "sci-fi" },
                { label: "Slice of Life", value: "slice-of-life" },
                { label: "Supernatural", value: "supernatural" },
            ],
        },
    } satisfies Filters;

    async popularNovels(
        pageNo: number,
        options: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];
        let url = `${this.site}/novel/`;

        if (options.filters?.genre?.value) {
            url = `${this.site}/genre/${options.filters.genre.value}/`;
        }

        if (pageNo > 1) {
            url += `page/${pageNo}/`;
        }

        const order = options.showLatestNovels ? "latest" : options.filters?.order?.value;
        if (order) {
            url += `?m_orderby=${order}`;
        }

        const result = await fetchApi(url);
        const body = await result.text();
        const $ = parseHTML(body);

        $(".page-item-detail, .manga-item, article.post, .series-item").each((_, element) => {
            const name = $(element).find(".post-title a, .title a, .entry-title a, h3 a").text().trim();
            const coverUrl =
                $(element).find("img").attr("data-src") ||
                $(element).find("img").attr("src") ||
                defaultCover;
            const novelUrl = $(element).find(".post-title a, .title a, .entry-title a, h3 a").attr("href");

            if (name && novelUrl) {
                const path = novelUrl.replace(this.site, "");
                novels.push({
                    name,
                    cover: coverUrl,
                    path,
                });
            }
        });

        return novels;
    }

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const url = `${this.site}${novelPath}`;
        const result = await fetchApi(url);
        const body = await result.text();
        const $ = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: $(".post-title h1, .entry-title, .series-title").text().trim() || "Tanpa Judul",
            cover:
                $(".summary_image img, .series-thumb img, .poster img").attr("data-src") ||
                $(".summary_image img, .series-thumb img, .poster img").attr("src") ||
                defaultCover,
            summary: $(".summary__content, .entry-content, .series-synopsis").text().trim(),
            status: NovelStatus.Unknown,
            chapters: [],
        };

        // Extract Status
        const statusText = $(".post-status .summary-content, .status-label, .series-info").text().toLowerCase();
        if (statusText.includes("ongoing") || statusText.includes("berjalan")) {
            novel.status = NovelStatus.Ongoing;
        } else if (statusText.includes("completed") || statusText.includes("tamat")) {
            novel.status = NovelStatus.Completed;
        }

        // Extract Author & Artist
        const author = $(".author-content a, .artist-content a").text().trim();
        if (author) {
            novel.author = author;
        }

        // Extract Genres
        const genres: string[] = [];
        $(".genres-content a, .series-genres a").each((_, el) => {
            const genre = $(el).text().trim();
            if (genre) genres.push(genre);
        });
        if (genres.length > 0) {
            novel.genres = genres.join(", ");
        }

        const chapters: Plugin.ChapterItem[] = [];

        $(".wp-manga-chapter, .wp-manga-chapter-item, .series-chapters li").each((_, element) => {
            const chapterName = $(element).find("a").text().trim().replace(/\s+/g, " ");
            const chapterUrl = $(element).find("a").attr("href");
            const releaseTime = $(element).find(".chapter-release-date, span.date").text().trim();

            if (chapterName && chapterUrl) {
                const chapterPath = chapterUrl.replace(this.site, "");
                chapters.push({
                    name: chapterName,
                    path: chapterPath,
                    releaseTime: releaseTime || undefined,
                });
            }
        });

        // LNReader memerlukan urutan chapter dari awal hingga terbaru
        novel.chapters = chapters.reverse();

        return novel;
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const url = `${this.site}${chapterPath}`;
        const result = await fetchApi(url);
        const body = await result.text();
        const $ = parseHTML(body);

        const contentElement = $(".reading-content, .entry-content, .epcontent");

        // Hapus elemen iklan, script, dan pelacak
        contentElement.find("script, style, ins, .ads, .ad-box, .sharedaddy, .adsbygoogle").remove();

        const chapterHtml = contentElement.html() || "";
        return chapterHtml.trim();
    }

    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        let url = `${this.site}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
        if (pageNo > 1) {
            url += `&paged=${pageNo}`;
        }

        const result = await fetchApi(url);
        const body = await result.text();
        const $ = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        $(".c-tabs-item__content, .page-item-detail, .search-wrap .post, article").each((_, element) => {
            const name = $(element).find(".post-title a, .entry-title a, h3 a").text().trim();
            const coverUrl =
                $(element).find("img").attr("data-src") ||
                $(element).find("img").attr("src") ||
                defaultCover;
            const novelUrl = $(element).find(".post-title a, .entry-title a, h3 a").attr("href");

            if (name && novelUrl) {
                const path = novelUrl.replace(this.site, "");
                novels.push({
                    name,
                    cover: coverUrl,
                    path,
                });
            }
        });

        return novels;
    }
}

export default new Meionovel();

