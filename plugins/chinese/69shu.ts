import { load as parseHTML } from "cheerio";
import { fetchText, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { NovelStatus } from "@libs/novelStatus";

class Shu69 implements Plugin.PluginBase {
    id = "69shu";
    name = "69书吧";
    icon = "src/cn/69shu/icon.png";
    site = "https://www.69shu.xyz";
    version = "0.1.0";

    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let url: string;
        if (filters.sort.value === 'none') {
            url = `${this.site}/rank/${filters.rank.value}/${pageNo}.html`;
        } else {
            url = `${this.site}/sort/${filters.sort.value}/${pageNo}.html`;
        }

        const body = await fetchText(url);
        if (body === '') throw Error('无法获取小说内容，请检查网络');

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio('div.book-coverlist').each((i, el) => {
            let url = loadedCheerio(el).find('a.cover').attr('href');

            const novelName = loadedCheerio(el).find('h4.name').text().trim();
            const novelCover = loadedCheerio(el).find('a.cover > img').attr('src');
            const novelUrl = this.site + url;

            if (!url) return;

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

        const body = await fetchText(url);
        if (body === '') throw Error('无法获取小说内容，请检查网络');

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio('h1').text().trim();

        novel.cover = loadedCheerio('div.cover > img').attr('src');

        novel.summary = loadedCheerio('#bookIntro').text().trim();

        const bookInfo = loadedCheerio('div.caption-bookinfo > p')

        novel.author = bookInfo.find("a").attr('title');

        novel.artist = undefined;

        novel.status = bookInfo.text().includes('连载') ? NovelStatus.Ongoing : NovelStatus.Completed;

        novel.genres = '';

        // Table of Content is on a different page than the summary page
        let chapters: Plugin.ChapterItem[] = [];

        const allUrl = loadedCheerio('dd.all > a').attr('href')
        if (allUrl) {
            const chaptersUrl = this.site + allUrl;
            const chaptersBody = await fetchText(chaptersUrl);

            const chaptersLoadedCheerio = parseHTML(chaptersBody);

            chaptersLoadedCheerio('dd').each((i, el) => {
                const chapterUrl = this.site + chaptersLoadedCheerio(el).find('a').attr('href');
                const chapterName = chaptersLoadedCheerio(el).find('a').text().trim();

                chapters.push({
                    name: chapterName,
                    url: chapterUrl,
                });
            });
        } else {
            loadedCheerio('div.panel.hidden-xs > dl.panel-chapterlist:nth-child(2) > dd').each((i, el) => {
                const chapterUrl = this.site + loadedCheerio(el).find('a').attr('href');
                const chapterName = loadedCheerio(el).find('a').text().trim();

                chapters.push({
                    name: chapterName,
                    url: chapterUrl,
                });
            });
        }

        novel.chapters = chapters;

        return novel;
    }

    async parseChapter(chapterUrl: string): Promise<string> {
        const url = chapterUrl;
        const body = await fetchText(url);

        const loadedCheerio = parseHTML(body);

        const chapterText = loadedCheerio('#chaptercontent').html() || '';

        return chapterText;
    };

    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const searchUrl = `${this.site}/search`;
        const formData = new FormData();
        formData.append('searchkey', searchTerm);

        const body = await fetchText(searchUrl, {
            method: 'post',
            body: formData,
        });
        if (body === '') throw Error('无法获取小说内容，请检查网络');


        let loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio('div.book-coverlist').each((i, el) => {
            let url = loadedCheerio(el).find('a.cover').attr('href');

            const novelName = loadedCheerio(el).find('h4.name').text().trim();
            const novelCover = loadedCheerio(el).find('a.cover > img').attr('src');
            const novelUrl = this.site + url;

            if (!url) return;

            const novel = {
                name: novelName,
                cover: novelCover,
                url: novelUrl,
            };

            novels.push(novel);
        });

        return novels;
    }

    fetchImage = fetchFile;

    filters = {
        rank: {
            label: "排行榜",
            value: "allvisit",
            options: [
                { label: "总排行榜", value: "allvisit" },

                { label: "月排行榜", value: "monthvisit" },

                { label: "周排行榜", value: "weekvisit" },

                { label: "日排行榜", value: "dayvisit" },

                { label: "收藏榜", value: "goodnum" },

                { label: "字数榜", value: "words" },

                { label: "推荐榜", value: "allvote" },

                { label: "新书榜", value: "postdate" },

                { label: "更新榜", value: "lastupdate" },
            ],
            type: FilterTypes.Picker,
        },
        sort: {
            label: "分类",
            value: "none",
            options: [
                { label: "无", value: "none" },

                { label: "全部", value: "all" },

                { label: "玄幻", value: "xuanhuan" },

                { label: "仙侠", value: "xianxia" },

                { label: "都市", value: "dushi" },

                { label: "历史", value: "lishi" },

                { label: "游戏", value: "youxi" },

                { label: "科幻", value: "kehuan" },

                { label: "灵异", value: "kongbu" },

                { label: "言情", value: "nvsheng" },

                { label: "其它", value: "qita" },
            ],
            type: FilterTypes.Picker,
        }
    } satisfies Filters;
}

export default new Shu69();
