import { Chapter, Novel, Plugin } from "@typings/plugin";
import { FilterInputs } from "@libs/filterInputs";
import { fetchApi, fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { load as parseHTML } from "cheerio";

export const id = "jaomix.ru";
export const name = "Jaomix";
export const site = "https://jaomix.ru";
export const version = "1.0.0";
export const icon = "src/ru/jaomix/icon.png";

export const popularNovels: Plugin.popularNovels = async function (
  page,
  { showLatestNovels, filters },
) {
  let url = site + "/?searchrn";

  if (filters?.lang instanceof Array) {
    url += filters.lang.map((lang, idx) => `&lang[${idx}]=${lang}`).join("");
  }
  if (filters?.genre instanceof Array) {
    url += filters.genre.map((genre, idx) => `&genre[${idx}]=${genre}`).join("");
  }
  if (filters?.delgenre instanceof Array) {
    url += filters.delgenre.map((genre, idx) => `&delgenre[${idx}]=del ${genre}`).join("");
  }

  url += "&sortcountchapt=" + (filters?.sortcountchapt || "1");
  url += "&sortdaycreate=" + (filters?.sortdaycreate || "1");
  url += "&sortby=" + (showLatestNovels ? "upd" : filters?.sortby || "topweek");
  url += "&gpage=" + page;

  const result = await fetchApi(url);
  let body = await result.text();

  const loadedCheerio = parseHTML(body);

  let novels: Novel.Item[] = [];
  loadedCheerio('div[class="block-home"] > div[class="one"]').each(function () {
    const name = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("title");
    const cover = loadedCheerio(this)
      .find('div[class="img-home"] > a > img')
      .attr("src")
      ?.replace("-150x150", "");
    const url = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("href");

    if (!name || !url) return;

    novels.push({ name, cover, url });
  });

  return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
  async function (novelUrl) {
    const result = await fetchApi(novelUrl);
    const body = await result.text();

    const loadedCheerio = parseHTML(body);
    let novel: Novel.instance = {
      url: novelUrl,
    };

    novel.name = loadedCheerio('div[class="desc-book"] > h1').text().trim();
    novel.cover = loadedCheerio('div[class="img-book"] > img').attr("src");
    novel.summary = loadedCheerio('div[id="desc-tab"]').text().trim();

    loadedCheerio("#info-book > p").each(function () {
      let text = loadedCheerio(this).text().replace(/,/g, "").split(" ");
      if (text[0] === "Автор:") {
        novel.author = text.splice(1).join(" ");
      } else if (text[0] === "Жанры:") {
        novel.genres = text.splice(1).join(",");
      } else if (text[0] === "Статус:") {
        novel.status = text.includes("продолжается")
          ? NovelStatus.Ongoing
          : NovelStatus.Completed;
      }
    });

    const chapters: Chapter.Item[] = [];

    loadedCheerio(".download-chapter div.title").each(function () {
      const name = loadedCheerio(this).find("a").attr("title");
      const releaseTime = loadedCheerio(this).find("time").text();
      const url = loadedCheerio(this).find("a").attr("href");
      if (!name || !url) return;

      chapters.push({ name, releaseTime, url });
    });

    novel.chapters = chapters.reverse();
    return novel;
  };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
  const result = await fetchApi(chapterUrl);
  const body = await result.text();
  const loadedCheerio = parseHTML(body);

  loadedCheerio('div[class="adblock-service"]').remove();
  const chapterText = loadedCheerio('div[class="entry-content"]').html();

  return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
  const url = `${site}/?searchrn=${searchTerm}&but=Поиск по названию&sortby=upd`;
  const result = await fetchApi(url);
  let body = await result.text();
  const loadedCheerio = parseHTML(body);

  let novels: Novel.Item[] = [];
  loadedCheerio('div[class="block-home"] > div[class="one"]').each(function () {
    const name = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("title");
    const cover = loadedCheerio(this)
      .find('div[class="img-home"] > a > img')
      .attr("src")
      ?.replace("-150x150", "");
    const url = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("href");

    if (!name || !url) return;

    novels.push({ name, cover, url });
  });

  return novels;
};

export const filters = [
  {
    key: "sortby",
    label: "Сортировка:",
    values: [
      { label: "Топ недели", value: "topweek" },
      { label: "По алфавиту", value: "alphabet" },
      { label: "По дате обновления", value: "upd" },
      { label: "По дате создания", value: "new" },
      { label: "По просмотрам", value: "count" },
      { label: "Топ года", value: "topyear" },
      { label: "Топ дня", value: "topday" },
      { label: "Топ за все время", value: "alltime" },
      { label: "Топ месяца", value: "topmonth" },
    ],
    inputType: FilterInputs.Picker,
  },
  {
    key: "sortdaycreate",
    label: "Дата добавления:",
    values: [
      { label: "Любое", value: "1" },
      { label: "От 120 до 180 дней", value: "1218" },
      { label: "От 180 до 365 дней", value: "1836" },
      { label: "От 30 до 60 дней", value: "3060" },
      { label: "От 365 дней", value: "365" },
      { label: "От 60 до 90 дней", value: "6090" },
      { label: "От 90 до 120 дней", value: "9012" },
      { label: "Послед. 30 дней", value: "30" },
    ],
    inputType: FilterInputs.Picker,
  },
  {
    key: "sortcountchapt",
    label: "Количество глав:",
    values: [
      { label: "Любое кол-во глав", value: "1" },
      { label: "До 500", value: "500" },
      { label: "От 1000 до 2000", value: "1020" },
      { label: "От 2000 до 3000", value: "2030" },
      { label: "От 3000 до 4000", value: "3040" },
      { label: "От 4000", value: "400" },
      { label: "От 500 до 1000", value: "510" },
    ],
    inputType: FilterInputs.Picker,
  },
  {
    key: "genre",
    label: "Жанры:",
    values: [
      { label: "Боевые Искусства", value: "Боевые Искусства" },
      { label: "Виртуальный Мир", value: "Виртуальный Мир" },
      { label: "Гарем", value: "Гарем" },
      { label: "Детектив", value: "Детектив" },
      { label: "Драма", value: "Драма" },
      { label: "Игра", value: "Игра" },
      { label: "Истории из жизни", value: "Истории из жизни" },
      { label: "Исторический", value: "Исторический" },
      { label: "История", value: "История" },
      { label: "Исэкай", value: "Исэкай" },
      { label: "Комедия", value: "Комедия" },
      { label: "Меха", value: "Меха" },
      { label: "Мистика", value: "Мистика" },
      { label: "Научная Фантастика", value: "Научная Фантастика" },
      { label: "Повседневность", value: "Повседневность" },
      { label: "Постапокалипсис", value: "Постапокалипсис" },
      { label: "Приключения", value: "Приключения" },
      { label: "Психология", value: "Психология" },
      { label: "Романтика", value: "Романтика" },
      { label: "Сверхъестественное", value: "Сверхъестественное" },
      { label: "Сёнэн", value: "Сёнэн" },
      { label: "Сёнэн-ай", value: "Сёнэн-ай" },
      { label: "Спорт", value: "Спорт" },
      { label: "Сэйнэн", value: "Сэйнэн" },
      { label: "Сюаньхуа", value: "Сюаньхуа" },
      { label: "Трагедия", value: "Трагедия" },
      { label: "Триллер", value: "Триллер" },
      { label: "Фантастика", value: "Фантастика" },
      { label: "Фэнтези", value: "Фэнтези" },
      { label: "Хоррор", value: "Хоррор" },
      { label: "Школьная жизнь", value: "Школьная жизнь" },
      { label: "Шоунен", value: "Шоунен" },
      { label: "Экшн", value: "Экшн" },
      { label: "Этти", value: "Этти" },
      { label: "Юри", value: "Юри" },
      { label: "Adult", value: "Adult" },
      { label: "Ecchi", value: "Ecchi" },
      { label: "Josei", value: "Josei" },
      { label: "Lolicon", value: "Lolicon" },
      { label: "Mature", value: "Mature" },
      { label: "Shoujo", value: "Shoujo" },
      { label: "Wuxia", value: "Wuxia" },
      { label: "Xianxia", value: "Xianxia" },
      { label: "Xuanhuan", value: "Xuanhuan" },
      { label: "Yaoi", value: "Yaoi" },
    ],
    inputType: FilterInputs.Checkbox,
  },
  {
    key: "delgenre",
    label: "Исключить жанры:",
    values: [
      { label: "Боевые Искусства", value: "Боевые Искусства" },
      { label: "Виртуальный Мир", value: "Виртуальный Мир" },
      { label: "Гарем", value: "Гарем" },
      { label: "Детектив", value: "Детектив" },
      { label: "Драма", value: "Драма" },
      { label: "Игра", value: "Игра" },
      { label: "Истории из жизни", value: "Истории из жизни" },
      { label: "Исторический", value: "Исторический" },
      { label: "История", value: "История" },
      { label: "Исэкай", value: "Исэкай" },
      { label: "Комедия", value: "Комедия" },
      { label: "Меха", value: "Меха" },
      { label: "Мистика", value: "Мистика" },
      { label: "Научная Фантастика", value: "Научная Фантастика" },
      { label: "Повседневность", value: "Повседневность" },
      { label: "Постапокалипсис", value: "Постапокалипсис" },
      { label: "Приключения", value: "Приключения" },
      { label: "Психология", value: "Психология" },
      { label: "Романтика", value: "Романтика" },
      { label: "Сверхъестественное", value: "Сверхъестественное" },
      { label: "Сёнэн", value: "Сёнэн" },
      { label: "Сёнэн-ай", value: "Сёнэн-ай" },
      { label: "Спорт", value: "Спорт" },
      { label: "Сэйнэн", value: "Сэйнэн" },
      { label: "Сюаньхуа", value: "Сюаньхуа" },
      { label: "Трагедия", value: "Трагедия" },
      { label: "Триллер", value: "Триллер" },
      { label: "Фантастика", value: "Фантастика" },
      { label: "Фэнтези", value: "Фэнтези" },
      { label: "Хоррор", value: "Хоррор" },
      { label: "Школьная жизнь", value: "Школьная жизнь" },
      { label: "Шоунен", value: "Шоунен" },
      { label: "Экшн", value: "Экшн" },
      { label: "Этти", value: "Этти" },
      { label: "Юри", value: "Юри" },
      { label: "Adult", value: "Adult" },
      { label: "Ecchi", value: "Ecchi" },
      { label: "Josei", value: "Josei" },
      { label: "Lolicon", value: "Lolicon" },
      { label: "Mature", value: "Mature" },
      { label: "Shoujo", value: "Shoujo" },
      { label: "Wuxia", value: "Wuxia" },
      { label: "Xianxia", value: "Xianxia" },
      { label: "Xuanhuan", value: "Xuanhuan" },
      { label: "Yaoi", value: "Yaoi" },
    ],
    inputType: FilterInputs.Checkbox,
  },
  {
    key: "lang",
    label: "Выбрать языки:",
    values: [
      { label: "Английский", value: "Английский" },
      { label: "Китайский", value: "Китайский" },
      { label: "Корейский", value: "Корейский" },
      { label: "Японский", value: "Японский" },
    ],
    inputType: FilterInputs.Checkbox,
  },
];

export const fetchImage: Plugin.fetchImage = fetchFile;
