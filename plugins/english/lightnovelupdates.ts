import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class LightNovelUpdates implements Plugin.PluginBase {
    id = "LightNovelUpdates";
    name = "Light Novel Updates";
    version = "1.0.0";
    icon = "src/en/lightnovelupdates/icon.png";
    site = "https://www.lightnovelupdates.com/";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        let url = `${this.baseUrl}novel/page/${pageNo}/?m_orderby=rating`;

    const body = await fetchApi(url).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio(".page-item-detail").each(function () {
        const novelName = loadedCheerio(this).find(".h5 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find(".h5 > a").attr("href");

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

        const body = await fetchApi(url).then((r) => r.text());

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio(".post-title > h1").text().trim();
        novel.cover =
            loadedCheerio(".summary_image > a > img").attr("src") || undefined;

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
                case "Genre(s)":
                    novel.genres = detail.trim().replace(/[\t\n]/g, ",");
                    break;
                case "Author(s)":
                    novel.author = detail.trim();
                    break;
                case "Status":
                    novel.status = detail.replace(/G/g, "g");
                    break;
            }
        });

        novel.summary = loadedCheerio("div.summary__content").text();

        const chapter: Plugin.ChapterItem[] = [];

        const novelId = loadedCheerio(".rating-post-id").attr("value")!;

        let formData = new FormData();
        formData.append("action", "manga_get_chapters");
        formData.append("manga", novelId);

        const data = await fetchApi(
            "https://www.lightnovelupdates.com/wp-admin/admin-ajax.php",
            {
                method: "POST",
                body: formData,
            },
        );
        const text = await data.text();

        loadedCheerio = parseHTML(text);

        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this).find("a").text().trim();
            const releaseDate = loadedCheerio(this).find("span").text().trim();
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
        const chapterText = 'unable to load';

        return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}?s=${searchTerm}&post_type=wp-manga&m_orderby=rating`;

    const body = await fetchApi(url).then((r) => r.text());

    const loadedCheerio = parseHTML(body);

    let novels: Plugin.NovelItem[] = [];

    loadedCheerio(".c-tabs-item__content").each(function () {
        const novelName = loadedCheerio(this).find(".h4 > a").text();
        const novelCover = loadedCheerio(this).find("img").attr("src");
        const novelUrl = loadedCheerio(this).find(".h4 > a").attr("href");

        if (!novelUrl) return;

        novels.push({
            url: novelUrl,
            name: novelName,
            cover: novelCover,
        });
    });
    return novels;
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return fetchFile(url);
    }

}

export default new LightNovelUpdates();