import { fetchApi, fetchFile } from "@libs/fetch";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "skynovels.net";
export const name = "SkyNovels";
export const site = "https://www.skynovels.net/";
export const version = "1.0.0";
export const icon = "src/es/skynovels/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (page) {
    const url = "https://api.skynovels.net/api/novels?&q";

    const result = await fetchApi(url);
    const body = await result.json();

    const novels: Novel.Item[] = [];

    body.novels.map((res) => {
        const novelName = res.nvl_title;
        const novelCover =
            "https://api.skynovels.net/api/get-image/" +
            res.image +
            "/novels/false";
        const novelUrl =
            baseUrl + "novelas/" + res.id + "/" + res.nvl_name + "/";

        const novel = { name: novelName, url: novelUrl, cover: novelCover };

        novels.push(novel);
    });

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novUrl) {
        let novelId = novUrl.substring().split("/")[4];
        const url =
            "https://api.skynovels.net/api/novel/" + novelId + "/reading?&q";

        const result = await fetchApi(url);
        const body = await result.json();

        const item = body.novel[0];

        let novel: Novel.instance = { url: novUrl };

        novel.name = item.nvl_title;

        novel.cover =
            "https://api.skynovels.net/api/get-image/" +
            item.image +
            "/novels/false";

        let genres: string[] = [];
        item.genres.map((genre) => genres.push(genre.genre_name));
        novel.genres = genres.join(",");
        novel.author = item.nvl_writer;
        novel.summary = item.nvl_content;
        novel.status = item.nvl_status;

        let novelChapters: Chapter.Item[] = [];

        item.volumes.map((volume) => {
            volume.chapters.map((chapter) => {
                const chapterName = chapter.chp_index_title;
                const releaseDate = new Date(chapter.createdAt).toDateString();
                const chapterUrl = novUrl + chapter.id + "/" + chapter.chp_name;

                const chap = {
                    name: chapterName,
                    releaseTime: releaseDate,
                    url: chapterUrl,
                };

                novelChapters.push(chap);
            });
        });

        novel.chapters = novelChapters;

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapUrl) {
    let chapterId = chapUrl.split("/")[6];
    const url = `https://api.skynovels.net/api/novel-chapter/${chapterId}`;

    const result = await fetchApi(url);
    const body = await result.json();

    const item = body.chapter[0];

    let chapterText = item.chp_content;

    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    searchTerm = searchTerm.toLowerCase();
    const url = "https://api.skynovels.net/api/novels?&q";

    const result = await fetchApi(url);
    const body = await result.json();

    let results = body.novels.filter((novel) =>
        novel.nvl_title.toLowerCase().includes(searchTerm)
    );

    const novels: Novel.Item[] = [];

    results.map((res) => {
        const novelName = res.nvl_title;
        const novelCover =
            "https://api.skynovels.net/api/get-image/" +
            res.image +
            "/novels/false";
        const novelUrl =
            baseUrl + "novelas/" + res.id + "/" + res.nvl_name + "/";

        const novel = { name: novelName, url: novelUrl, cover: novelCover };

        novels.push(novel);
    });

    return novels;
};
