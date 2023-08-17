import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { showToast } from "@libs/showToast";
import { Chapter, Novel, Plugin } from "@typings/plugin";

const pluginId = "lnmtl";
const baseUrl = "https://lnmtl.com/";

export const popularNovels: Plugin.popularNovels = async function (page) {
    let url = baseUrl + "novel?page=" + page;

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];

    loadedCheerio(".media").each(function () {
        const novelName = loadedCheerio(this).find("h4").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find("h4 > a").attr("href");

        if (!novelUrl) return;

        const novel = {
            name: novelName,
            cover: novelCover,
            url: novelUrl,
        };

        novels.push(novel);
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        showToast("LNMTL might take around 20-30 seconds.");

        const url = novelUrl;

        const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

        const loadedCheerio = parseHTML(body);

        const novel: Novel.instance = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio(".novel-name").text();

        novel.cover = loadedCheerio("div.novel").find("img").attr("src");

        novel.summary = loadedCheerio("div.description").text().trim();

        loadedCheerio(".panel-body > dl").each(function () {
            let detailName = loadedCheerio(this).find("dt").text().trim();
            let detail = loadedCheerio(this).find("dd").text().trim();

            switch (detailName) {
                case "Authors":
                    novel.author = detail;
                    break;
                case "Current status":
                    novel.status = detail;
                    break;
            }
        });

        novel.genres = loadedCheerio('.panel-heading:contains(" Genres ")')
            .next()
            .text()
            .trim()
            .replace(/\s\s/g, ",");

        let volumes = JSON.parse(
            loadedCheerio("main")
                .next()
                .html()
                .match(/lnmtl.volumes = \[(.*?)\]/).[0]
                .replace("lnmtl.volumes = ", "")
        );

        let chapters: Chapter.Item[] = [];

        volumes = volumes.map((volume) => volume.id);

        for (const volume of volumes) {
            let volumeData = await fetchApi(
                `https://lnmtl.com/chapter?page=1&volumeId=${volume}`
            );
            volumeData = await volumeData.json();

            // volumeData = volumeData.data.map((volume) => volume.slug);

            for (let i = 1; i <= volumeData.last_page; i++) {
                let chapterData = await fetchApi(
                    `https://lnmtl.com/chapter?page=${i}&volumeId=${volume}`
                );
                chapterData = await chapterData.json();

                chapterData = chapterData.data.map((chapter) => ({
                    name: `#${chapter.number} ${chapter.title}`,
                    url: `${baseUrl}chapter/${chapter.slug}`,
                    releaseTime: chapter.created_at,
                }));

                chapters.push(...chapterData);
            }
        }

        novel.chapters = chapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const body = await fetchApi(chapterUrl, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    loadedCheerio(".original").replaceWith("<br><br>");

    let chapterText = loadedCheerio(".chapter-body").html();

    if (!chapterText) {
        chapterText = loadedCheerio(".alert.alert-warning").text();
    }

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = "https://lnmtl.com/term";

    const body = await fetchApi(url, {}, pluginId).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels:Novel.Item[] = loadedCheerio("footer")
        .next()
        .next()
        .html()
        .match(/local: \[(.*?)\]/)[0]
        .replace("local: ", "");

    novels = JSON.parse(novels);

    novels = novels.filter((novel) =>
        novel.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    novels = novels.map((novel) => ({
        name: novel.name,
        url: novel.slug,
        cover: novel.image,
    }));

    return novels;
};

export const fetchImage: Plugin.fetchImage = async function (url) {
    const headers = {
        Referer: baseUrl,
    };
    return await fetchFile(url, { headers: headers });
};

module.exports = {
    id: pluginId,
    name: "LNMTL",
    version: "1.0.0",
    icon: "src/en/lnmtl/icon.png",
    site: baseUrl,
    protected: true,
    fetchImage,
    popularNovels,
    parseNovelAndChapters,
    parseChapter,
    searchNovels,
};
