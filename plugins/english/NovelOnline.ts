import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "NO.net";
export const name = "novelsOnline";
export const site = "https://novelsonline.net";
export const icon = "src/coverNotAvailable.jpg";
export const version = "1.0.0";

const pluginId = id;

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const result = await fetchApi(
        "https://novelsonline.net/sResults.php",
        {
            headers: {
                Accept: "*/*",
                "Accept-Language": "pl,en-US;q=0.7,en;q=0.3",
                "Content-Type":
                    "application/x-www-form-urlencoded; charset=UTF-8",
            },
            method: "POST",
            body: "q=" + encodeURIComponent(searchTerm),
        },
        pluginId
    ).then((res) => res.text());
    let $ = parseHTML(result);

    const headers = $("li");
    return headers
        .map((i, h) => {
            const novelName = $(h).text();
            const novelUrl = $(h).find("a").attr("href");
            const novelCover = $(h).find("img").attr("src");

            if (!novelUrl) {
                return null;
            }

            return {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };
        })
        .get()
        .filter((sr) => sr !== null);
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        let novel: Novel.instance = {
            url: novelUrl,
            chapters: [],
        };

        const result = await fetchApi(novelUrl).then((res) => res.text());
        let $ = parseHTML(result);

        novel.name = $("h1").text();
        novel.cover = $(".novel-cover").find("a > img").attr("src");
        novel.author = $(
            "div.novel-details > div:nth-child(5) > div.novel-detail-body"
        )
            .find("li")
            .map((_, el) => $(el).text())
            .get()
            .join(", ");

        novel.genres = $(
            "div.novel-details > div:nth-child(2) > div.novel-detail-body"
        )
            .find("li")
            .map((_, el) => $(el).text())
            .get()
            .join(",");

        novel.summary = $(
            "div.novel-right > div > div:nth-child(1) > div.novel-detail-body"
        ).text();

        novel.chapters = $("ul.chapter-chs > li > a")
            .map((_, el) => {
                const chapterUrl = $(el).attr("href");
                const chapterName = $(el).text();

                return {
                    name: chapterName,
                    releaseTime: "",
                    url: chapterUrl,
                } as Chapter.Item;
            })
            .get();

        return novel;
    };

export const popularNovels: Plugin.popularNovels = async function (page) {
    return []; /** TO DO */
};

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const result = await fetchApi(chapterUrl).then((res) => res.text());
    let loadedCheerio = parseHTML(result);

    const chapterText = loadedCheerio("#contentall").html() || "";

    return chapterText;
};
export const fetchImage: Plugin.fetchImage = fetchFile;
