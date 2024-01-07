import { fetchFile, fetchApi } from "@libs/fetch";
import { Filters, FilterTypes } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";
import { NovelStatus } from "@libs/novelStatus";
import { load as parseHTML } from "cheerio";
// import { defaultCover } from "@libs/defaultCover";

export interface IfreedomMetadata {
  id: string;
  sourceSite: string;
  sourceName: string;
  filters?: Filters;
}

class IfreedomPlugin implements Plugin.PluginBase {
  id: string;
  name: string;
  icon: string;
  site: string;
  version: string;
  userAgent: string;
  cookieString: string;
  filters?: Filters;

  constructor(metadata: IfreedomMetadata) {
    this.id = metadata.id;
    this.name = metadata.sourceName + "[ifreedom]";
    this.icon = `multisrc/ifreedom/icons/${metadata.id}.png`;
    this.site = metadata.sourceSite;
    this.version = "1.0.0";
    this.userAgent = "";
    this.cookieString = "";
    this.filters = metadata.filters;
  }

  async popularNovels(
    page: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    let url = this.site + "/vse-knigi/?sort=" +
      (showLatestNovels ? "По дате обновления" : filters?.sort?.value || "По рейтингу");

    if (filters?.status?.value instanceof Array) {
      url += filters.status.value.map((i) => "&status[]=" + i).join("");
    }
    if (filters?.lang?.value instanceof Array) {
      url += filters.lang.value.map((i) => "&lang[]=" + i).join("");
    }
    if (filters?.genre?.value instanceof Array) {
      url += filters.genre.value.map((i) => "&genre[]=" + i).join("");
    }
    url += "&bpage=" + page;

    const body = await fetchApi(url).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    const novels: Plugin.NovelItem[] = loadedCheerio(
      "div.one-book-home > div.img-home a",
    )
      .map((index, element) => ({
        name: loadedCheerio(element).attr("title") || "",
        cover: loadedCheerio(element).find("img").attr("src"),
        url: loadedCheerio(element).attr("href") || "",
      }))
      .get()
      .filter((novel) => novel.name && novel.url);

    return novels;
  }

  async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(novelUrl).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      url: novelUrl,
      name: loadedCheerio(".entry-title").text(),
      cover: loadedCheerio(".img-ranobe > img").attr("src"),
      summary: loadedCheerio('meta[name="description"]').attr("content"),
    };

    loadedCheerio("div.data-ranobe").each(function () {
      switch (loadedCheerio(this).find("b").text()) {
        case "Автор":
          novel.author = loadedCheerio(this)
            .find("div.data-value")
            .text()
            .trim();
          break;
        case "Жанры":
          novel.genres = loadedCheerio("div.data-value > a")
            .map((index, element) => loadedCheerio(element).text()?.trim())
            .get()
            .join(",");
          break;
        case "Статус книги":
          novel.status = loadedCheerio("div.data-value")
            .text()
            .includes("активен")
            ? NovelStatus.Ongoing
            : NovelStatus.Completed;
          break;
      }
    });

    if (novel.author == "Не указан") delete novel.author;

    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio("div.li-ranobe").each(function () {
      const name = loadedCheerio(this).find("a").text();
      const url = loadedCheerio(this).find("a").attr("href");
      if (!loadedCheerio(this).find("label.buy-ranobe").length && name && url) {
        const releaseTime = loadedCheerio(this)
          .find("div.li-col2-ranobe").text().trim();

        chapters.push({ name, releaseTime, url });
      }
    });

    novel.chapters = chapters.reverse();
    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const body = await fetchApi(chapterUrl).then((res) => res.text());
    const loadedCheerio = parseHTML(body);

    loadedCheerio(".entry-content img").each(function () {
      const srcset = loadedCheerio(this).attr("srcset")?.split?.(" ");
      if (srcset?.length) {
        const bestlink = srcset.filter((url) => url.startsWith("http")).unshift();
        if (typeof bestlink == 'string') loadedCheerio(this).attr("src", bestlink);
      }
    });

    const chapterText = loadedCheerio(".entry-content").html() || "";
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    page: number | undefined = 1,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.site + "/vse-knigi/?searchname=" + searchTerm + "&bpage=" + page;
    const result = await fetchApi(url).then((res) => res.text());
    const loadedCheerio = parseHTML(result);

    const novels: Plugin.NovelItem[] = loadedCheerio(
      "div.one-book-home > div.img-home a",
    )
      .map((index, element) => ({
        name: loadedCheerio(element).attr("title") || "",
        cover: loadedCheerio(element).find("img").attr("src"),
        url: loadedCheerio(element).attr("href") || "",
      }))
      .get()
      .filter((novel) => novel.name && novel.url);

    return novels;
  }

  fetchImage = fetchFile;
}

const plugin = new IfreedomPlugin({"id":"bookhamster","sourceSite":"https://bookhamster.ru","sourceName":"Bookhamster","filters":{"sort":{"type":FilterTypes.Picker,"label":"Сортировка:","options":[{"label":"По дате добавления","value":"По дате добавления"},{"label":"По дате обновления","value":"По дате обновления"},{"label":"По количеству глав","value":"По количеству глав"},{"label":"По названию","value":"По названию"},{"label":"По просмотрам","value":"По просмотрам"},{"label":"По рейтингу","value":"По рейтингу"}],"value":"По рейтингу"},"status":{"type":FilterTypes.CheckboxGroup,"label":"Статус:","options":[{"label":"Перевод активен","value":"Перевод активен"},{"label":"Перевод приостановлен","value":"Перевод приостановлен"},{"label":"Произведение завершено","value":"Произведение завершено"}],"value":[]},"lang":{"type":FilterTypes.CheckboxGroup,"label":"Язык:","options":[{"label":"Английский","value":"Английский"},{"label":"Китайский","value":"Китайский"},{"label":"Корейский","value":"Корейский"},{"label":"Японский","value":"Японский"}],"value":[]},"genre":{"type":FilterTypes.CheckboxGroup,"label":"Жанры:","options":[{"label":"Боевик","value":"Боевик"},{"label":"Боевые Искусства","value":"Боевые Искусства"},{"label":"Вампиры","value":"Вампиры"},{"label":"Виртуальный Мир","value":"Виртуальный Мир"},{"label":"Гарем","value":"Гарем"},{"label":"Героическое фэнтези","value":"Героическое фэнтези"},{"label":"Детектив","value":"Детектив"},{"label":"Дзёсэй","value":"Дзёсэй"},{"label":"Драма","value":"Драма"},{"label":"Игра","value":"Игра"},{"label":"История","value":"История"},{"label":"Киберпанк","value":"Киберпанк"},{"label":"Комедия","value":"Комедия"},{"label":"ЛитРПГ","value":"ЛитРПГ"},{"label":"Меха","value":"Меха"},{"label":"Милитари","value":"Милитари"},{"label":"Мистика","value":"Мистика"},{"label":"Научная Фантастика","value":"Научная Фантастика"},{"label":"Повседневность","value":"Повседневность"},{"label":"Постапокалипсис","value":"Постапокалипсис"},{"label":"Приключения","value":"Приключения"},{"label":"Психология","value":"Психология"},{"label":"Романтика","value":"Романтика"},{"label":"Сверхъестественное","value":"Сверхъестественное"},{"label":"Сёдзё","value":"Сёдзё"},{"label":"Сёнэн","value":"Сёнэн"},{"label":"Сёнэн-ай","value":"Сёнэн-ай"},{"label":"Спорт","value":"Спорт"},{"label":"Сэйнэн","value":"Сэйнэн"},{"label":"Сюаньхуа","value":"Сюаньхуа"},{"label":"Трагедия","value":"Трагедия"},{"label":"Триллер","value":"Триллер"},{"label":"Ужасы","value":"Ужасы"},{"label":"Фантастика","value":"Фантастика"},{"label":"Фэнтези","value":"Фэнтези"},{"label":"Школьная жизнь","value":"Школьная жизнь"},{"label":"Экшн","value":"Экшн"},{"label":"Эротика","value":"Эротика"},{"label":"Этти","value":"Этти"},{"label":"Яой","value":"Яой"},{"label":"Adult","value":"Adult"},{"label":"Mature","value":"Mature"},{"label":"Xianxia","value":"Xianxia"},{"label":"Xuanhuan","value":"Xuanhuan"}],"value":[]}}});
export default plugin;