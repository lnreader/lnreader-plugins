import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";

class Foxaholic implements Plugin.PluginBase {
    id = "foxaholic";
    name = "Foxaholic";
    icon = "src/en/foxaholic/icon.png";
    site = "https://www.foxaholic.com/";
    filters?: Filters | undefined;
    version = "1.0.0";
    baseUrl = this.site;
    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<Filters>): Promise<Plugin.NovelItem[]> {
        const link = `${this.baseUrl}novel/page/${pageNo}/?m_orderby=rating`;

        const result = await fetchApi(link);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio(".page-item-detail").each(function () {
            const novelName = loadedCheerio(this).find(".h5 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
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
        const result = await fetchApi(url);
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio(".post-title > h1").text().trim();

        novel.cover = loadedCheerio(".summary_image > a > img").attr(
            "data-src"
        );

        loadedCheerio(".post-content_item").each(function () {
            const detailName = loadedCheerio(this)
                .find(".summary-heading > h5")
                .text()
                .trim();
            const detail = loadedCheerio(this).find(".summary-content").html();

            if (!detail) return;

            switch (detailName) {
                case "Genre":
                    novel.genres = loadedCheerio(detail)
                        .children("a")
                        .map((i, el) => loadedCheerio(el).text())
                        .toArray()
                        .join(",");
                    break;
                case "Author":
                    novel.author = loadedCheerio(detail)
                        .children("a")
                        .map((i, el) => loadedCheerio(el).text())
                        .toArray()
                        .join(", ");
                    break;
                case "Novel":
                    novel.status = detail?.trim().replace(/G/g, "g");
                    break;
            }
        });

        loadedCheerio(
            ".description-summary > div.summary__content > div"
        ).remove();

        novel.summary = loadedCheerio(
            ".description-summary > div.summary__content"
        )
            .text()
            .trim();

        let chapter: Plugin.ChapterItem[] = [];
        loadedCheerio(".wp-manga-chapter").each(function () {
            const chapterName = loadedCheerio(this)
                .find("a")
                .text()
                .replace(/[\t\n]/g, "")
                .trim();
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
        const result = await fetchApi(chapterUrl);
            const body = await result.text();

            const loadedCheerio = parseHTML(body);

            loadedCheerio("img").removeAttr("srcset");
            let chapterText = loadedCheerio(".reading-content").html() || '';

            return chapterText;
    }
    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.baseUrl}?s=${searchTerm}&post_type=wp-manga`;
        const result = await fetchApi(url);
        const body = await result.text();

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio(".c-tabs-item__content").each(function () {
            const novelName = loadedCheerio(this).find(".h4 > a").text();
            const novelCover = loadedCheerio(this).find("img").attr("data-src");
            const novelUrl = loadedCheerio(this).find(".h4 > a").attr("href");

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
        return fetchFile(url);
    }

}

export default new Foxaholic();
