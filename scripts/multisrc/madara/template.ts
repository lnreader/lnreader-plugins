import { fetchApi, fetchFile } from "@libs/fetch";
import { Filters, FilterTypes } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { load as parseHTML } from "cheerio";
import { defaultCover } from "@libs/defaultCover";
import { NovelStatus } from "@libs/novelStatus";
import dayjs from "dayjs";

const includesAny = (str: string, keywords: string[]) =>
  new RegExp(keywords.join("|")).test(str);

interface MadaraOptionPath {
  genres?: string;
  novels?: string;
  novel?: string;
  chapter?: string;
}

const MadaraDefaultPath = {
  genres: "novel-genre",
  novels: "novel",
  novel: "novel",
  chapter: "novel",
};

interface MadaraOptions {
  useNewChapterEndpoint?: boolean;
  path?: MadaraOptionPath;
  lang?: string;
  orderBy?: string;
}

export interface MadaraMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  options?: MadaraOptions;
  filters?: Filters;
}

class MadaraPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  options?: MadaraOptions;
  filters?: Filters | undefined;

  constructor(metadata: MadaraMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName;
    const iconFileName = metadata.sourceName.replace(/\s+/g, "").toLowerCase();
    this.icon = `multisrc/madara/icons/${iconFileName}.png`;
    this.site = metadata.sourceSite;
    this.version = "1.0.0";
    this.options = metadata.options;
    this.filters = metadata.filters;
  }

  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];

    let url = this.site;
    if (filters?.genres?.value) {
      url +=
        (this.options?.path?.genres || MadaraDefaultPath.genres) + "/" +
        filters.genres.value;
    } else {
      url += this.options?.path?.novels || MadaraDefaultPath.novels;
    }

    url += "/page/" + pageNo + "/?m_orderby=" +
      (showLatestNovels ? "latest" : filters?.sort?.value || "rating");

    const body = await fetchApi(url).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    loadedCheerio(".manga-title-badges").remove();

    loadedCheerio(".page-item-detail").each((index, element) => {
      const novelName = loadedCheerio(element).find(".post-title").text().trim();
      const novelUrl =
        loadedCheerio(element).find(".post-title").find("a").attr("href") || "";
      if (!novelName || !novelUrl) return;

      const image = loadedCheerio(element).find("img");
      const novelCover = image.attr("data-src") || image.attr("src");

      const novel: Plugin.NovelItem = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ""),
      };

      novels.push(novel);
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then((res) => res.text());
    let loadedCheerio = parseHTML(body);

    loadedCheerio(".manga-title-badges, #manga-title span").remove();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        loadedCheerio(".post-title h1").text().trim() ||
        loadedCheerio("#manga-title h1").text(),
    };

    novel.cover =
      loadedCheerio(".summary_image > a > img").attr("data-lazy-src") ||
      loadedCheerio(".summary_image > a > img").attr("data-src") ||
      loadedCheerio(".summary_image > a > img").attr("src") ||
      loadedCheerio(".summary_image > a > img").attr("src") ||
      defaultCover;

    loadedCheerio(".post-content_item, .post-content").each(function () {
      const detailName = loadedCheerio(this).find("h5").text().trim();
      const detail = loadedCheerio(this).find(".summary-content").text().trim();

      switch (detailName) {
        case "Genre(s)":
        case "Género(s)":
        case "التصنيفات":
          novel.genres = detail;
          break;
        case "Author(s)":
        case "Autor(es)":
        case "المؤلف":
        case "المؤلف (ين)":
          novel.author = detail;
          break;
        case "Status":
        case "Estado":
          novel.status =
            detail.includes("OnGoing") || detail.includes("مستمرة")
              ? NovelStatus.Ongoing
              : NovelStatus.Completed;
          break;
      }
    });

    loadedCheerio("div.summary__content .code-block,script").remove();
    novel.summary =
      loadedCheerio("div.summary__content").text().trim() ||
      loadedCheerio("#tab-manga-about").text().trim() ||
      loadedCheerio('.post-content_item h5:contains("Summary")')
        .next()
        .text()
        .trim();
    const chapters: Plugin.ChapterItem[] = [];
    let html = "";

    if (this.options?.useNewChapterEndpoint) {
      html = await fetchApi(this.site + novelPath + "ajax/chapters/", {
        method: "POST",
      }).then((res) => res.text());
    } else {
      const novelId =
        loadedCheerio(".rating-post-id").attr("value") ||
        loadedCheerio("#manga-chapters-holder").attr("data-id") ||
        "";

      const formData = new FormData();
      formData.append("action", "manga_get_chapters");
      formData.append("manga", novelId);

      html = await fetchApi(this.site + "wp-admin/admin-ajax.php", {
        method: "POST",
        body: formData,
      }).then((res) => res.text());
    }

    if (html !== "0") {
      loadedCheerio = parseHTML(html);
    }

    const totalChapters = loadedCheerio(".wp-manga-chapter").length;
    loadedCheerio(".wp-manga-chapter").each((chapterIndex, element) => {
      const chapterName = loadedCheerio(element).find("a").text().trim();

      let releaseDate = loadedCheerio(element)
        .find("span.chapter-release-date")
        .text()
        .trim();

      if (releaseDate) {
        releaseDate = this.parseData(releaseDate);
      } else {
        releaseDate = dayjs().format("LL");
      }

      let chapterUrl = loadedCheerio(element).find("a").attr("href") || "";

      chapters.push({
        name: chapterName,
        path: chapterUrl.replace(this.site, ""),
        releaseTime: releaseDate || null,
        chapterNumber: totalChapters - chapterIndex,
      });
    });

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then((res) => res.text());

    const loadedCheerio = parseHTML(body);
    const chapterText =
      loadedCheerio(".text-left").html() ||
      loadedCheerio(".text-right").html() ||
      loadedCheerio(".entry-content").html() ||
      loadedCheerio(".c-blog-post > div > div:nth-child(2)").html() ||
      "";

    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo?: number | undefined,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const url = this.site + "?s=" + searchTerm + "&post_type=wp-manga";

    const body = await fetchApi(url).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    loadedCheerio(".c-tabs-item__content").each((index, element) => {
      const novelName = loadedCheerio(element).find(".post-title").text().trim();
      const novelUrl = loadedCheerio(element).find(".post-title").find("a").attr("href") || "";
      if (!novelName || !novelUrl) return;
      let image = loadedCheerio(element).find("img");
      const novelCover = image.attr("data-src") || image.attr("src");

      const novel = {
        name: novelName,
        cover: novelCover,
        path: novelUrl.replace(this.site, ""),
      };

      novels.push(novel);
    });
    return novels;
  }

  fetchImage = fetchFile;

  parseData = (date: string) => {
    const dayJSDate = dayjs(); // today
    const timeAgo = date.match(/\d+/)?.[0] || "";
    const timeAgoInt = parseInt(timeAgo, 10);

    if (!timeAgo) return date; // there is no number!

    if (includesAny(date, ["detik", "segundo", "second", "วินาที"])) {
      dayJSDate.subtract(timeAgoInt, "second"); // go back N seconds
    } else if (
      includesAny(date, [
        "menit",
        "dakika",
        "min",
        "minute",
        "minuto",
        "นาที",
        "دقائق",
      ])
    ) {
      dayJSDate.subtract(timeAgoInt, "minute"); // go back N minute
    } else if (
      includesAny(date, [
        "jam",
        "saat",
        "heure",
        "hora",
        "hour",
        "ชั่วโมง",
        "giờ",
        "ore",
        "ساعة",
        "小时",
      ])
    ) {
      dayJSDate.subtract(timeAgoInt, "hours"); // go back N hours
    } else if (
      includesAny(date, [
        "hari",
        "gün",
        "jour",
        "día",
        "dia",
        "day",
        "วัน",
        "ngày",
        "giorni",
        "أيام",
        "天",
      ])
    ) {
      dayJSDate.subtract(timeAgoInt, "days"); // go back N days
    } else if (includesAny(date, ["week", "semana"])) {
      dayJSDate.subtract(timeAgoInt, "week"); // go back N a week
    } else if (includesAny(date, ["month", "mes"])) {
      dayJSDate.subtract(timeAgoInt, "month"); // go back N months
    } else if (includesAny(date, ["year", "año"])) {
      dayJSDate.subtract(timeAgoInt, "year"); // go back N years
    } else {
      return date;
    }

    return dayJSDate.format("LL");
  };
}
