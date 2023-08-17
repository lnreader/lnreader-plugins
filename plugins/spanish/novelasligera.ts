import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "ligera.com";
export const name = "Novelas Ligera";
export const site = "https://novelasligera.com/";
export const version = "1.0.0";
export const icon = "src/es/novelasligera/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl;

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".elementor-column").each(function () {
        const novelName = loadedCheerio(this)
            .find(".widget-image-caption.wp-caption-text")
            .text();
        if (novelName) {
            const novelCover = loadedCheerio(this)
                .find("a > img")
                .attr("data-lazy-src");

            let novelUrl = loadedCheerio(this).find("a").attr("href");
            if (!novelUrl) return;
            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        }
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const url = baseUrl + "novela/" + novelUrl;

        // console.log(url);

        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        let novel: Novel.instance = { url };

        novel.name = loadedCheerio("h1").text();

        novel.cover = loadedCheerio(".elementor-widget-container")
            .find("img")
            .attr("src");

        loadedCheerio(".elementor-row")
            .find("p")
            .each(function () {
                if (loadedCheerio(this).text().includes("Autor:")) {
                    novel.author = loadedCheerio(this)
                        .text()
                        .replace("Autor:", "")
                        .trim();
                }
                if (loadedCheerio(this).text().includes("Estado:")) {
                    novel.status = loadedCheerio(this)
                        .text()
                        .replace("Estado: ", "")
                        .trim();
                }

                if (loadedCheerio(this).text().includes("Género:")) {
                    loadedCheerio(this).find("span").remove();
                    novel.genres = loadedCheerio(this)
                        .text()
                        .replace(/,\s/g, ",");
                }
            });

        novel.summary = loadedCheerio(
            ".elementor-text-editor.elementor-clearfix"
        ).text();

        let novelChapters: Chapter.Item[] = [];

        loadedCheerio(".elementor-accordion-item").remove();

        loadedCheerio(".elementor-tab-content")
            .find("li")
            .each(function () {
                const chapterName = loadedCheerio(this).text();
                const releaseDate = null;
                const chapterUrl = loadedCheerio(this).find("a").attr("href");
                if (!chapterUrl) return;
                const chapter = {
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                };

                novelChapters.push(chapter);
            });

        novel.chapters = novelChapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = chapterUrl;
    // console.log(url);

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);
    loadedCheerio(".osny-nightmode.osny-nightmode--left").remove();
    loadedCheerio(".code-block.code-block-1").remove();
    loadedCheerio(".adsb30").remove();
    loadedCheerio(".saboxplugin-wrap").remove();
    loadedCheerio(".wp-post-navigation").remove();

    let chapterText = loadedCheerio(".entry-content").html();
    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = baseUrl + "?s=" + searchTerm + "&post_type=wp-manga";
    // console.log(url);

    const result = await fetchApi(url);
    const body = await result.text();

    let loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".inside-article").each(function () {
        const novelCover = loadedCheerio(this).find("img").attr("src");
        let novelUrl = loadedCheerio(this).find("a").attr("href");

        let novelName;

        if (novelUrl) {
            novelName = novelUrl.replace(/-/g, " ").replace(/^./, function (x) {
                return x.toUpperCase();
            });
        }

        novelUrl += "/";

        if (!novelName || !novelUrl) return;

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        novels.push(novel);
    });

    novels = [{ ...novels[1] }];

    return novels;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
