import { load as parseHTML } from "cheerio";
import { fetchText, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { encode } from "urlencode";
import { NovelStatus } from "@libs/novelStatus";

class XinShu69 implements Plugin.PluginBase {
    id = "69xinshu";
    name = "69书吧";
    icon = "src/cn/69xinshu/icon.png";
    site = "https://www.69xinshu.com";
    version = "0.1.1";

    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let url: string;
        if (pageNo === 1) {
            url = `${this.site}/novels/class/${filters.class.value}.htm`;
        } else {
            url = `${this.site}/ajax_novels/class/${filters.class.value}/${pageNo}.htm`;
        }

        const body = await fetchText(url, {}, 'gbk');
        if (body === '') throw Error('无法获取小说列表，请检查网络');

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        const novelsList = pageNo === 1 ? loadedCheerio('div.newbox > ul > li') : loadedCheerio('li');
        novelsList.each(function () {
            const novelUrl = loadedCheerio(this).find('li > div > h3 > a:nth-child(2)').attr('href');

            if (novelUrl) {
                const novelName = loadedCheerio(this).find('li > div > h3 > a:nth-child(2)').text();
                const novelCover = loadedCheerio(this)
                    .find('li > a > img')
                    .attr('data-src');

                const novel = {
                    name: novelName,
                    cover: novelCover,
                    url: novelUrl,
                };

                novels.push(novel);
            }
        });

        return novels;
    }

    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        const url = novelUrl;

        const body = await fetchText(url, {}, 'gbk');
        if (body === '') throw Error('无法获取小说内容，请检查网络');

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio('h1 > a').text();

        novel.cover = loadedCheerio('div.bookimg2 > img').attr(
            'src',
        );

        novel.summary = loadedCheerio('div.navtxt').text().trim();

        const bookInfo = loadedCheerio('div.booknav2').text()

        const authorMatch = bookInfo.match(/作者：(.*)/);
        if (authorMatch) {
            novel.author = authorMatch[1];
        }

        novel.artist = undefined;

        novel.status = bookInfo.includes('连载') ? NovelStatus.Ongoing : NovelStatus.Completed;

        const genresMatch = bookInfo.match(/分类：(.*)/);
        if (genresMatch) {
            novel.genres = genresMatch[1];
        }

        // Table of Content is on a different page than the summary page
        let chapters: Plugin.ChapterItem[] = [];

        const chaptersUrl = loadedCheerio('a.more-btn').attr('href');
        if (chaptersUrl) {
            const chaptersBody = await fetchText(chaptersUrl, {}, 'gbk');

            const chaptersLoadedCheerio = parseHTML(chaptersBody);

            chaptersLoadedCheerio('li').each(function () {
                const chapterUrl = chaptersLoadedCheerio(this).find('a').attr('href');

                if (chapterUrl?.startsWith("https://")) {
                    const chapterName = chaptersLoadedCheerio(this).find('a').text().trim();

                    chapters.push({
                        name: chapterName,
                        url: chapterUrl,
                    });
                }
            });
        }

        novel.chapters = chapters;

        return novel;
    }

    async parseChapter(chapterUrl: string): Promise<string> {
        const body = await fetchText(chapterUrl, {}, 'gbk');

        const loadedCheerio = parseHTML(body);

        const chapterText = (loadedCheerio('div.txtnav').prop('innerText') ?? '')
            .split('\n')
            // remove empty lines
            .map((line: string) => line.trim())
            .filter((line: string) => line !== '')
            // remove the first two lines which are the chapter name and author name
            .slice(2)
            .map((line: string) => `<p>${line}</p>`)
            .join('\n');

        return chapterText;
    };

    async searchNovels(
        searchTerm: string,
        pageNo: number
    ): Promise<Plugin.NovelItem[]> {
        if (pageNo > 1) return [];

        const searchUrl = `${this.site}/modules/article/search.php`;
        const formData = new FormData();
        formData.append('searchkey', encode(searchTerm, 'gbk'));
        formData.append('searchtype', 'all');

        const body = await fetchText(searchUrl, { method: 'post', body: formData, }, 'gbk');
        if (body === '') throw Error('无法获取搜索结果，请检查网络');

        let loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio('div.newbox > ul > li').each(function () {
            const novelUrl = loadedCheerio(this).find('a').attr('href')!;
            const novelName = loadedCheerio(this).find('div.newnav > h3').text();
            const novelCover = loadedCheerio(this).find('img').attr('data-src');

            const novel = {
                name: novelName,
                url: novelUrl,
                cover: novelCover,
            };

            novels.push(novel);
        });

        return novels;
    }

    fetchImage = fetchFile;

    filters = {
        class: {
            label: "分类",
            value: "0",
            options: [
                { label: "全部分类", value: "0" },
                { label: "言情小说", value: "3" },
                { label: "玄幻魔法", value: "1" },
                { label: "修真武侠", value: "2" },
                { label: "穿越时空", value: "11" },
                { label: "都市小说", value: "9" },
                { label: "历史军事", value: "4" },
                { label: "游戏竞技", value: "5" },
                { label: "科幻空间", value: "6" },
                { label: "悬疑惊悚", value: "7" },
                { label: "同人小说", value: "8" },
                { label: "官场职场", value: "10" },
                { label: "青春校园", value: "12" },
            ],
            type: FilterTypes.Picker,
        },
    } satisfies Filters;
}

export default new XinShu69();
