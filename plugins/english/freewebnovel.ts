import { Plugin } from "@typings/plugin";
import { fetchApi, fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { load as parseHTML } from "cheerio";

class FreeWebNovel implements Plugin.PluginBase {
  id = "FWN.com";
  name = "Web NOVEL";
  site = "https://freewebnovel.com";
  version = "1.0.0";
  icon = "src/en/freewebnovel/icon.png";
  userAgent = "";
  cookieString = "";

  async popularNovels(
    page: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels
      ? "/latest-release-novels/"
      : "/completed-novels/";

    const body = await fetchApi(this.site + sort + page).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = loadedCheerio(".li-row")
      .map((index, element) => ({
        name: loadedCheerio(element).find(".tit").text(),
        cover: loadedCheerio(element).find("img").attr("src"),
        url: this.site + loadedCheerio(element).find("h3 > a").attr("href"),
      }))
      .get();

    return novels;
  }

  async parseNovelAndChapters(url: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(url).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = { url };
    novel.name = loadedCheerio("h1.tit").text();
    novel.cover = loadedCheerio(".pic > img").attr("src");
    novel.genres = loadedCheerio("[title=Genre]")
      .next()
      .text()
      .replace(/[\t\n]/g, "");

    novel.author = loadedCheerio("[title=Author]")
      .next()
      .text()
      .replace(/[\t\n]/g, "");

    novel.status = loadedCheerio("[title=Status]")
      .next()
      .text()
      .replace(/[\t\n]/g, "");

    novel.summary = loadedCheerio(".inner").text().trim();

    const chapters: Plugin.ChapterItem[] = loadedCheerio("#idData > li > a")
      .map((index, element) => ({
        name: loadedCheerio(element).attr("title") || "Chapter " + index,
        releaseTime: null,
        url: this.site + loadedCheerio(element).attr("href"),
      }))
      .get();

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const body = await fetchApi(chapterUrl).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    const chapterText = loadedCheerio("div.txt").html() || "";
    return chapterText;
  }

  async searchNovels(
    searchkey: string,
  ): Promise<Plugin.NovelItem[]> {
    const body = await fetchApi(this.site + "/search/", {
      method: "POST",
      body: JSON.stringify({ searchkey }),
    }).then((res) => res.text());

    const loadedCheerio = parseHTML(body);
    const novels: Plugin.NovelItem[] = loadedCheerio(".li-row > .li > .con")
      .map((index, element) => ({
        name: loadedCheerio(element).find(".tit").text(),
        cover: loadedCheerio(element).find(".pic > a > img").attr("data-cfsrc"),
        url: this.site + loadedCheerio(element).find("h3 > a").attr("href"),
      }))
      .get();

    return novels;
  }

  fetchImage = fetchFile;
}

export default new FreeWebNovel();
