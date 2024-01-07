import { fetchFile, fetchApi } from "@libs/fetch";
import { Filters, FilterTypes } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { NovelStatus } from "@libs/novelStatus";
import { load as parseHTML } from "cheerio";
import { parseMadaraDate } from "@libs/parseMadaraDate";
// import { defaultCover } from "@libs/defaultCover";

export interface ReadwnMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  filters?: Filters;
}

class ReadwnPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  userAgent: string;
  cookieString: string;
  filters?: Filters;

  constructor(metadata: ReadwnMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName + "[readwn]";
    const iconFileName = metadata.sourceName.replace(/\s+/g, "").toLowerCase();
    this.icon = `multisrc/readwn/icons/${iconFileName}.png`;
    this.site = metadata.sourceSite;
    this.version = "1.0.0";
    this.userAgent = "";
    this.cookieString = "";
    this.filters = metadata.filters;
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + "/list/";
    url += (filters?.genres?.value || "all") + "/";
    url += (filters?.status?.value || "all") + "-";
    url += showLatestNovels ? "lastdotime" : filters?.sort?.value || "newstime";
    url += "-" + (pageNo - 1) + ".html";

    if (filters?.tags?.value) { //only 1 page
      url = this.site + "/tags/" + filters.tags.value + "-0.html";
    }

    const body = await fetchApi(url).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = loadedCheerio("li.novel-item")
      .map((index, element) => ({
        name: loadedCheerio(element).find("h4").text(),
        cover: this.site +
          loadedCheerio(element).find(".novel-cover > img").attr("data-src"),
        url: this.site + loadedCheerio(element).find("a").attr("href"),
      }))
      .get();

    return novels;
  }

  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(novelUrl).then((res) => res.text());

    const loadedCheerio = parseHTML(body);
    const novel: Plugin.SourceNovel = {
      url: novelUrl,
    };

    novel.name = loadedCheerio("h1.novel-title").text();
    novel.author = loadedCheerio("span[itemprop=author]").text();
    novel.cover = this.site + loadedCheerio("figure.cover > img").attr("data-src");

    novel.summary = loadedCheerio(".summary")
      .text()
      .replace("Summary", "")
      .trim();

    novel.genres = loadedCheerio("div.categories > ul > li")
      .map((index, element) => loadedCheerio(element).text()?.trim())
      .get()
      .join(",");

    loadedCheerio("div.header-stats > span").each(function () {
      if (loadedCheerio(this).find("small").text() === "Status") {
        novel.status = loadedCheerio(this).find("strong").text();
      }
    });

    const latestChapterNo = parseInt(
      loadedCheerio(".header-stats")
        .find("span > strong")
        .first()
        .text()
        .trim(),
    );

    const chapters: Plugin.ChapterItem[] = loadedCheerio(".chapter-list li")
      .map((index, element) => {
        const name = loadedCheerio(element).find("a .chapter-title").text().trim();
        const url = loadedCheerio(element).find("a").attr("href")?.trim();
        const releaseTime = loadedCheerio(element).find("a .chapter-update").text().trim();

        if (!name || !url) return null;

        return {
          name,
          releaseTime: parseMadaraDate(releaseTime),
          url: this.site + url,
        };
      })
      .get()
      .filter((chapter) => chapter);

    if (latestChapterNo > chapters.length) {
      const lastChapterNo = parseInt(
        chapters[chapters.length - 1].url.match(/_(\d+)\.html/)?.[1] || "",
        10,
      );

      for (let i = (lastChapterNo || chapters.length) + 1; i <= latestChapterNo; i++) {
        chapters.push({
          name: "Chapter " + i,
          releaseTime: null,
          url: novelUrl.replace(".html", "_" + i + ".html"),
        });
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const body = await fetchApi(chapterUrl).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio(".chapter-content").html() || "";
    return chapterText;
  }

  async searchNovels(keyboard: string): Promise<Plugin.NovelItem[]> {
    const result = await fetchApi(this.site + "/e/search/index.php", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: this.site + "/search.html",
        Origin: this.site,
        "user-agent":
          this.userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
      },
      method: "POST",
      body: JSON.stringify({
        show: "title",
        tempid: 1,
        tbname: "news",
        keyboard,
      }),
    }).then((res) => res.text());
    const loadedCheerio = parseHTML(result);

    const novels: Plugin.NovelItem[] = loadedCheerio("li.novel-item")
      .map((index, element) => ({
        name: loadedCheerio(element).find("h4").text(),
        cover: this.site + loadedCheerio(element).find("img").attr("data-src"),
        url: this.site + loadedCheerio(element).find("a").attr("href"),
      }))
      .get();

    return novels;
  }

  fetchImage = fetchFile;
}
