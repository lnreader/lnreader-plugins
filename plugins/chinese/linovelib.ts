import { CheerioAPI, load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { showToast } from "@libs/showToast";

class Linovelib implements Plugin.PluginBase {
    id = "linovelib";
    name = "Linovelib";
    icon = "src/cn/linovelib/icon.png";
    site = "https://w.linovelib.com";
    version = "1.0.0";
    userAgent = "";
    cookieString = "";
    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        let link = `${this.site}/top/`;

        link += filters.sort;

        link += `/${pageNo}.html`;

        const headers = new Headers();
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
        const body = await fetchApi(link, { headers }).then((result) =>
            result.text()
        );

        const loadedCheerio = parseHTML(body);

        const novels: Plugin.NovelItem[] = [];

        loadedCheerio(".module-rank-booklist .book-layout").each((i, el) => {
            let url = loadedCheerio(el).attr("href");

            const novelName = loadedCheerio(el).find(".book-title").text();
            const novelCover = loadedCheerio(el)
                .find("img.book-cover")
                .attr("data-src");
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
        const headers = new Headers();
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
        const result = await fetchApi(url, { headers });
        const body = await result.text();

        let loadedCheerio = parseHTML(body);

        const novel: Plugin.SourceNovel = {
            url,
            chapters: [],
        };

        novel.name = loadedCheerio("#bookDetailWrapper .book-title").text();

        novel.cover = loadedCheerio("#bookDetailWrapper img.book-cover").attr(
            "src"
        );

        novel.summary = loadedCheerio("#bookSummary content").text();

        novel.author = loadedCheerio(
            "#bookDetailWrapper .book-rand-a a"
        ).text();

        // TODO: Need some regex and dirty selector to get it
        // Need to look into how to translate that message
        novel.status = undefined;

        novel.genres = loadedCheerio(".tag-small.red")
            .children("a")
            .map((i, el) => loadedCheerio(el).text())
            .toArray()
            .join(",");

        // Table of Content is on a different page than the summary page
        let chapter: Plugin.ChapterItem[] = [];

        const idPattern = /\/(\d+)\.html/;
        const novelId = url.match(idPattern)?.[1];

        const chaptersUrl =
            this.site + loadedCheerio("#btnReadBook").attr("href");
        const chaptersResult = await fetchApi(chaptersUrl, { headers });
        const chaptersBody = await chaptersResult.text();

        const chaptersLoadedCheerio = parseHTML(chaptersBody);

        let volumeName: string, chapterId: number;

        chaptersLoadedCheerio("#volumes .chapter-li").each((i, el) => {
            if (chaptersLoadedCheerio(el).hasClass("chapter-bar")) {
                volumeName = chaptersLoadedCheerio(el).text();
            } else {
                const urlPart = chaptersLoadedCheerio(el)
                    .find(".chapter-li-a")
                    .attr("href");
                const chapterIdMatch = urlPart?.match(idPattern);

                // Sometimes the href attribute does not contain the url, but javascript:cid(0).
                // Increment the previous chapter ID should result in the right URL
                if (chapterIdMatch) {
                    chapterId = +chapterIdMatch[1];
                } else {
                    chapterId++;
                }
            }

            const chapterUrl = `${this.site}/novel/${novelId}/${chapterId}.html`;
            const chapterName =
                volumeName +
                " — " +
                chaptersLoadedCheerio(el).find(".chapter-index").text().trim();
            const releaseDate = null;

            if (!chapterId) return;

            chapter.push({
                name: chapterName,
                releaseTime: releaseDate,
                url: chapterUrl,
            });
        });

        novel.chapters = chapter;

        return novel;
    }

    async parseChapter(chapterUrl: string): Promise<string> {
        const headers = new Headers();
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
        let chapterName,
            chapterText = "",
            hasNextPage,
            pageHasNextPage,
            pageText = "";
        let pageNumber = 1;

        /*
         * TODO: Maybe there are other ways to get the translation table
         * It is embed and encrypted inside readtool.js
         * UPDATE: Decrypted, see skillgg
         */
        // const mapping_dict = {
        //   '“': '「',
        //   '’': '』',
        //   '': '是',
        //   '': '不',
        //   '': '好',
        //   '': '个',
        //   '': '开',
        //   '': '样',
        //   '': '想',
        //   '': '说',
        //   '': '年',
        //   '': '那',
        //   '': '她',
        //   '': '美',
        //   '': '自',
        //   '': '家',
        //   '': '而',
        //   '': '去',
        //   '': '都',
        //   '': '于',
        //   '': '舔',
        //   '': '他',
        //   '': '只',
        //   '': '看',
        //   '': '来',
        //   '': '用',
        //   '': '道',
        //   '': '得',
        //   '': '乳',
        //   '': '茎',
        //   '': '肉',
        //   '': '胸',
        //   '': '淫',
        //   '': '性',
        //   '': '骚',
        //   '”': '」',
        //   '': '的',
        //   '': '当',
        //   '': '人',
        //   '': '有',
        //   '': '上',
        //   '': '到',
        //   '': '地',
        //   '': '中',
        //   '': '生',
        //   '': '着',
        //   '': '和',
        //   '': '起',
        //   '': '交',
        //   '': '以',
        //   '': '可',
        //   '': '过',
        //   '': '能',
        //   '': '多',
        //   '': '心',
        //   '': '小',
        //   '': '成',
        //   '': '了',
        //   '': '把',
        //   '': '发',
        //   '': '第',
        //   '': '子',
        //   '': '事',
        //   '': '阴',
        //   '': '欲',
        //   '': '里',
        //   '': '私',
        //   '': '臀',
        //   '': '脱',
        //   '': '唇',
        //   '‘': '『',
        //   '': '一',
        //   '': '我',
        //   '': '在',
        //   '': '这',
        //   '': '们',
        //   '': '时',
        //   '': '为',
        //   '': '你',
        //   '': '国',
        //   '': '就',
        //   '': '要',
        //   '': '也',
        //   '': '后',
        //   '': '没',
        //   '': '下',
        //   '': '天',
        //   '': '对',
        //   '': '然',
        //   '': '学',
        //   '': '之',
        //   '': '出',
        //   '': '没',
        //   '': '如',
        //   '': '还',
        //   '': '大',
        //   '': '作',
        //   '': '种',
        //   '': '液',
        //   '': '呻',
        //   '': '射',
        //   '': '穴',
        //   '': '么',
        //   '': '裸',
        // };
        const skillgg: Record<string, string> = {
            "\u201c": "\u300c",
            "\u201d": "\u300d",
            "\u2018": "\u300e",
            "\u2019": "\u300f",
            "\ue82c": "\u7684",
            "\ue852": "\u4e00",
            "\ue82d": "\u662f",
            "\ue819": "\u4e86",
            "\ue856": "\u6211",
            "\ue857": "\u4e0d",
            "\ue816": "\u4eba",
            "\ue83c": "\u5728",
            "\ue830": "\u4ed6",
            "\ue82e": "\u6709",
            "\ue836": "\u8fd9",
            "\ue859": "\u4e2a",
            "\ue80a": "\u4e0a",
            "\ue855": "\u4eec",
            "\ue842": "\u6765",
            "\ue858": "\u5230",
            "\ue80b": "\u65f6",
            "\ue81f": "\u5927",
            "\ue84a": "\u5730",
            "\ue853": "\u4e3a",
            "\ue81e": "\u5b50",
            "\ue822": "\u4e2d",
            "\ue813": "\u4f60",
            "\ue85b": "\u8bf4",
            "\ue807": "\u751f",
            "\ue818": "\u56fd",
            "\ue810": "\u5e74",
            "\ue812": "\u7740",
            "\ue851": "\u5c31",
            "\ue801": "\u90a3",
            "\ue80c": "\u548c",
            "\ue815": "\u8981",
            "\ue84c": "\u5979",
            "\ue840": "\u51fa",
            "\ue848": "\u4e5f",
            "\ue835": "\u5f97",
            "\ue800": "\u91cc",
            "\ue826": "\u540e",
            "\ue863": "\u81ea",
            "\ue861": "\u4ee5",
            "\ue854": "\u4f1a",
            "\ue827": "\u5bb6",
            "\ue83b": "\u53ef",
            "\ue85d": "\u4e0b",
            "\ue84d": "\u800c",
            "\ue862": "\u8fc7",
            "\ue81c": "\u5929",
            "\ue81d": "\u53bb",
            "\ue860": "\u80fd",
            "\ue843": "\u5bf9",
            "\ue82f": "\u5c0f",
            "\ue802": "\u591a",
            "\ue831": "\u7136",
            "\ue84b": "\u4e8e",
            "\ue837": "\u5fc3",
            "\ue829": "\u5b66",
            "\ue85e": "\u4e48",
            "\ue83a": "\u4e4b",
            "\ue832": "\u90fd",
            "\ue808": "\u597d",
            "\ue841": "\u770b",
            "\ue821": "\u8d77",
            "\ue845": "\u53d1",
            "\ue803": "\u5f53",
            "\ue828": "\u6ca1",
            "\ue81b": "\u6210",
            "\ue83e": "\u53ea",
            "\ue820": "\u5982",
            "\ue84e": "\u4e8b",
            "\ue85a": "\u628a",
            "\ue806": "\u8fd8",
            "\ue83f": "\u7528",
            "\ue833": "\u7b2c",
            "\ue811": "\u6837",
            "\ue804": "\u9053",
            "\ue814": "\u60f3",
            "\ue80f": "\u4f5c",
            "\ue84f": "\u79cd",
            "\ue80e": "\u5f00",
            "\ue823": "\u7f8e",
            "\ue849": "\u4e73",
            "\ue805": "\u9634",
            "\ue809": "\u6db2",
            "\ue81a": "\u830e",
            "\ue844": "\u6b32",
            "\ue847": "\u547b",
            "\ue850": "\u8089",
            "\ue824": "\u4ea4",
            "\ue85f": "\u6027",
            "\ue817": "\u80f8",
            "\ue85c": "\u79c1",
            "\ue838": "\u7a74",
            "\ue82a": "\u6deb",
            "\ue83d": "\u81c0",
            "\ue82b": "\u8214",
            "\ue80d": "\u5c04",
            "\ue839": "\u8131",
            "\ue834": "\u88f8",
            "\ue846": "\u9a9a",
            "\ue825": "\u5507",
        };
        const addPage = async (pageCheerio: CheerioAPI) => {
            const formatPage = async () => {
                // Remove JS
                pageCheerio("#ccacontent .cgo").remove();

                // Load lazyloaded images
                pageCheerio("#ccacontent img.imagecontent").each((i, el) => {
                    // Sometimes images are either in data-src or src
                    const imgSrc =
                        pageCheerio(el).attr("data-src") ||
                        pageCheerio(el).attr("src");
                    if (imgSrc) {
                        // The original CDN URL is locked behind a CF-like challenge, switch the URL to bypass that
                        // There are no react-native-url-polyfill lib, can't use URL API
                        const regex = /\/\/.+\.com\//;
                        const imgUrl = imgSrc.replace(
                            regex,
                            "//img.linovelib.com/"
                        );
                        // Clean up img element
                        pageCheerio(el)
                            .attr("src", imgUrl)
                            .removeAttr("data-src")
                            .removeClass("lazyload");
                    }
                });

                // Recover the original character
                pageText = pageCheerio("#ccacontent").html() || "";
                pageText = pageText.replace(
                    /./g,
                    (char) => skillgg[char] || char
                );

                return Promise.resolve();
            };

            await formatPage();
            chapterName =
                pageCheerio("#atitle + h3").text() +
                " — " +
                pageCheerio("#atitle").text();
            if (chapterText === "") {
                chapterText = "<h2>" + chapterName + "</h2>";
            }
            chapterText += pageText;
        };

        const loadPage = async (url: string) => {
            const result = await fetchApi(url, { headers });
            const body = await result.text();
            const pageCheerio = parseHTML(body);
            await addPage(pageCheerio);
            pageHasNextPage =
                pageCheerio("#footlink a:last").text() === "下一页"
                    ? true
                    : false;
            return { pageCheerio, pageHasNextPage };
        };

        let url = chapterUrl;
        do {
            const page = await loadPage(url);
            hasNextPage = page.pageHasNextPage;
            if (hasNextPage === true) {
                pageNumber++;
                url = chapterUrl.replace(
                    /\.html/gi,
                    `_${pageNumber}` + ".html"
                );
            }
        } while (hasNextPage === true);

        return chapterText;
    }

    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        const searchUrl = `${this.site}/search/`;
        const Term = encodeURI(searchTerm);
        const headers = new Headers();
        if (this.cookieString) {
            headers.append("cookie", this.cookieString);
        }
        let NextPage, NoNextPage: boolean, DeadEnd;
        pageNo = 1;
        const novels: Plugin.NovelItem[] = [];

        const addPage = async (pageCheerio: CheerioAPI, redirect: string) => {
            const loadSearchResults = () => {
                pageCheerio(".book-ol .book-layout").each((i, el) => {
                    let nUrl = pageCheerio(el).attr("href");

                    const novelName = pageCheerio(el)
                        .find(".book-title")
                        .text();
                    const novelCover = pageCheerio(el)
                        .find("img.book-cover")
                        .attr("data-src");
                    const novelUrl = this.site + nUrl;

                    if (!nUrl) return;

                    novels.push({
                        name: novelName,
                        url: novelUrl,
                        cover: novelCover,
                    });
                });
            };

            const novelResults = pageCheerio(".book-ol a.book-layout");
            if (novelResults.length === 0) {
                showToast("Bypass check by searching in Webview");
            } else {
                loadSearchResults();
            }

            if (redirect.length) {
                novels.length = 0;
                const novelName = pageCheerio(
                    "#bookDetailWrapper .book-title"
                ).text();

                const novelCover = pageCheerio(
                    "#bookDetailWrapper img.book-cover"
                ).attr("src");
                const novelUrl =
                    this.site +
                    pageCheerio("#btnReadBook").attr("href")?.slice(0, -8) +
                    ".html";
                novels.push({
                    name: novelName,
                    url: novelUrl,
                    cover: novelCover,
                });
            }
        };

        const loadPage = async (url: string) => {
            const result = await fetchApi(url, { headers });
            const body = await result.text();
            const pageCheerio = parseHTML(body);
            const redirect = pageCheerio("div.book-layout").text();
            await addPage(pageCheerio, redirect);
            NextPage = pageCheerio(".next").attr("href");
            if (!NextPage) {
                NoNextPage === true;
            } else {
                NoNextPage = NextPage === "#" ? true : false;
            }
            return { pageCheerio, NoNextPage };
        };

        let url = `${searchUrl}${Term}_${pageNo}.html`;
        do {
            const page = await loadPage(url);
            DeadEnd = page.NoNextPage;
            if (DeadEnd === false) {
                pageNo++;
                url = `${searchUrl}${Term}_${pageNo}.html`;
            }
        } while (DeadEnd === false);

        return novels;
    }

    async fetchImage(url: string): Promise<string | undefined> {
        return await fetchFile(url);
    }
    filters = {
        sort: {
            label: "Sort By",
            value: "monthvisit",
            options: [
                { label: "月点击榜", value: "monthvisit" },

                { label: "周点击榜", value: "weekvisit" },

                { label: "月推荐榜", value: "monthvote" },

                { label: "周推荐榜", value: "weekvote" },

                { label: "月鲜花榜", value: "monthflower" },

                { label: "周鲜花榜", value: "weekflower" },

                { label: "月鸡蛋榜", value: "monthegg" },

                { label: "周鸡蛋榜", value: "weekegg" },

                { label: "最近更新", value: "lastupdate" },

                { label: "最新入库", value: "postdate" },

                { label: "收藏榜", value: "goodnum" },

                { label: "新书榜", value: "newhot" },
            ],
            type: FilterTypes.Picker,
        },
    } satisfies Filters;
}

export default new Linovelib();
