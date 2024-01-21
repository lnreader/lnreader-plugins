import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";
import { NovelStatus } from "@libs/novelStatus";

class TuNovelaLigera implements Plugin.PluginBase {
    id = "tunovelaligera";
    name = "TuNovelaLigera";
    icon = "src/es/tunovelaligera/icon.png";
    site = "https://tunovelaligera.com/";
    version = "1.0.0";



    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let link = `${this.site}`;

        link += filters.genres.value ? `genero/` + filters.genres.value : "novelas";

        link += `/page/${pageNo}`;

        link += filters.order.value;

        const headers = new Headers();
        const result = await fetchApi(link, { headers });
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio(".page-item-detail").each((i, el) => {
            const novelName = loadedCheerio(el).find(".h5 > a").text();
            const novelCover = loadedCheerio(el).find("img").attr("src");
            const novelUrl = loadedCheerio(el).find(".h5 > a").attr("href");

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

        loadedCheerio(".manga-title-badges").remove();

        novel.name = loadedCheerio(".post-title > h1").text().trim();

        let novelCover = loadedCheerio(".summary_image > a > img");

        novel.cover =
            novelCover.attr("data-src") ||
            novelCover.attr("src") ||
            novelCover.attr("data-cfsrc") ||
            defaultCover;

        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = loadedCheerio(this)
                .find(".summary-content")
                .text()
                .trim();

            switch (detailName) {
                case "Generos":
                    novel.genres = detail.replace(/, /g, ",");
                    break;
                case "Autores":
                    novel.author = detail;
                    break;
                case "Estado":
                    novel.status =
                        detail.includes("OnGoing") ||
                        detail.includes("Updating")
                            ? NovelStatus.Ongoing
                            : NovelStatus.Completed;
                    break;
            }
        });

        novel.summary = loadedCheerio("div.summary__content > p").text().trim();

        let chapter: Plugin.ChapterItem[] = [];

        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        let lastPage = 1;
        lastPage = +loadedCheerio(".lcp_paginator li:last").prev().text();

        const getChapters = async () => {
            const n = url.split("/");
            const novelName = n[4];
            const formData = new FormData();
            formData.append("action", "madara_load_more");
            formData.append("page", "0");
            formData.append("template", "html/loop/content");
            formData.append("vars[category_name]", novelName);
            formData.append("vars[posts_per_page]", "10000");

            const result = await fetchApi(
                `${this.site}wp-admin/admin-ajax.php`,
                {
                    method: "POST",
                    body: formData,
                    headers,
                }
            );
            const text = await result.text();

            loadedCheerio = parseHTML(text);

            loadedCheerio(".heading").each((i, el) => {
                const chapterName = loadedCheerio(el)
                    .text()
                    .replace(/[\t\n]/g, "")
                    .trim();
                const releaseDate = null;
                const chapterUrl =
                    loadedCheerio(el).find("a").attr("href") || "";

                chapter.push({
                    name: chapterName,
                    url: chapterUrl,
                    releaseTime: releaseDate,
                });
            });
            return chapter.reverse();
        };

        const getPageChapters = async () => {
            for (let i = 1; i <= lastPage; i++) {
                const chaptersUrl = `${novelUrl}?lcp_page0=${i}`;
                const result = await fetchApi(chaptersUrl, { headers });
                const chaptersHTML = await result.text();

                let chapterCheerio = parseHTML(chaptersHTML);

                chapterCheerio(".lcp_catlist li").each((i, el) => {
                    const chapterName = chapterCheerio(el)
                        .find("a")
                        .text()
                        .replace(/[\t\n]/g, "")
                        .trim();

                    const releaseDate = chapterCheerio(el)
                        .find("span")
                        .text()
                        .trim();

                    const chapterUrl =
                        chapterCheerio(el).find("a").attr("href") || "";

                    chapter.push({
                        name: chapterName,
                        releaseTime: releaseDate,
                        url: chapterUrl,
                    });
                });
                await delay(1000);
            }
            return chapter.reverse();
        };

        novel.chapters = await getChapters();

        if (!novel.chapters.length) {
            await delay(1000);
            novel.chapters = await getPageChapters();
        }

        return novel;
    }

    async parseChapter(chapterUrl: string): Promise<string> {
        const headers = new Headers();
        const result = await fetchApi(chapterUrl);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        loadedCheerio("#hola_siguiente").next().find("div").remove();
        const chapterText =
            loadedCheerio("#hola_siguiente").next().html() || "";

        return chapterText;
    }

    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}?s=${searchTerm}&post_type=wp-manga`;

        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio(".c-tabs-item__content").each((i, el) => {
            const novelName = loadedCheerio(el).find(".h4 > a").text();
            const novelCover = loadedCheerio(el).find("img").attr("src");
            const novelUrl = loadedCheerio(el).find(".h4 > a").attr("href");
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
            value: "?m_orderby=rating",
            label: "Ordenado por",
            options: [
                { label: "Lo mas reciente", value: "?m_orderby=latest" },

                { label: "A-Z", value: "?m_orderby=alphabet" },

                { label: "Clasificación", value: "?m_orderby=rating" },

                { label: "Trending", value: "?m_orderby=trending" },

                { label: "Mas visto", value: "?m_orderby=views" },

                { label: "Nuevo", value: "?m_orderby=new-manga" },
            ],
            type: FilterTypes.Picker,
        },
        genres: {
            value: "",
            label: "Generos",
            options: [
                { label: "None", value: "" },
                { label: "Acción", value: "accion" },

                { label: "Adulto", value: "adulto" },

                { label: "Artes Marciales", value: "artes-marciales" },

                { label: "Aventura", value: "aventura" },

                { label: "Ciencia Ficción", value: "ciencia-ficcion" },

                { label: "Comedia", value: "comedia" },

                { label: "Deportes", value: "deportes" },

                { label: "Drama", value: "drama" },

                { label: "Eastern Fantasy", value: "eastern-fantasy" },

                { label: "Ecchi", value: "ecchi" },

                { label: "FanFiction", value: "fan-fiction" },

                { label: "Fantasía", value: "fantasia" },

                { label: "Fantasía oriental", value: "fantasia-oriental" },

                { label: "Ficción Romántica", value: "ficcion-romantica" },

                { label: "Gender Bender", value: "gender-bender" },

                { label: "Harem", value: "harem" },

                { label: "Histórico", value: "historico" },

                { label: "Horror", value: "horror" },

                { label: "Josei", value: "josei" },

                { label: "Maduro", value: "maduro" },

                { label: "Mecha", value: "mecha" },

                { label: "Misterio", value: "misterio" },

                { label: "Novela China", value: "novela-china" },

                { label: "Novela FanFiction", value: "novela-fanfiction" },

                { label: "Novela Japonesa", value: "novela-japonesa" },

                { label: "Novela Koreana", value: "novela-koreana" },

                { label: "Novela ligera", value: "novela-ligera" },

                { label: "Novela original", value: "novela-original" },

                { label: "Novela Web", value: "web-novel" },

                { label: "Psicológico", value: "psicologico" },

                { label: "Realismo Mágico", value: "realismo-magico" },

                { label: "Recuento de vida", value: "recuento-de-vida" },

                { label: "Romance", value: "romance" },

                {
                    label: "Romance contemporáneo",
                    value: "romance-contemporaneo",
                },

                { label: "Romance Moderno", value: "romance-moderno" },

                { label: "Seinen", value: "seinen" },

                { label: "Shoujo", value: "shoujo" },

                { label: "Shounen", value: "shounen" },

                { label: "Sobrenatural", value: "sobrenatural" },

                { label: "Tragedia", value: "tragedia" },

                { label: "Vampiros", value: "vampiros" },

                { label: "Vida Escolar", value: "vida-escolar" },

                { label: "Western Fantasy", value: "western-fantasy" },

                { label: "Wuxia", value: "wuxia" },

                { label: "Xianxia", value: "xianxia" },

                { label: "Xuanhuan", value: "xuanhuan" },

                { label: "Yaoi", value: "yaoi" },
            ],
            type: FilterTypes.Picker,
        },
    } satisfies Filters;
}

export default new TuNovelaLigera();
