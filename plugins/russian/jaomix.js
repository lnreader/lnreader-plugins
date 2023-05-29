const cheerio = require("cheerio");
const fetchApi = require("@libs/fetchApi");
const fetchFile = require("@libs/fetchFile");
const languages = require("@libs/languages");
const Status = require("@libs/novelStatus");
const FilterInputs = require("@libs/filterInputs");

const pluginId = "jaomix.ru";
const sourceName = "Jaomix";
const baseUrl = "https://jaomix.ru";

async function popularNovels(page, { showLatestNovels, filters }) {
  let url = baseUrl + "/?searchrn&sortby=";
  url += showLatestNovels ? "upd" : filters?.sort || "count";

  if (filters?.type?.length) {
    url += filters.type.map((i) => `&lang[]=${i}`).join("");
  }

  if (filters?.genres?.length) {
    url += filters.genres.map((i) => `&genre[]=${i}`).join("");
  }
  url += `&page=${page}`;

  const result = await fetchApi(url);
  let body = await result.text();

  const loadedCheerio = cheerio.load(body);

  let novels = [];
  loadedCheerio('div[class="block-home"] > div[class="one"]').each(function () {
    const name = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("title");
    const cover = loadedCheerio(this)
      .find('div[class="img-home"] > a > img')
      .attr("src")
      .replace("-150x150", "");
    const url = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("href");

    novels.push({ name, cover, url });
  });

  return novels;
}

async function parseNovelAndChapters(novelUrl) {
  const result = await fetchApi(novelUrl);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);
  let novel = {
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
        ? Status.Ongoing
        : Status.Completed;
    }
  });

  const chapters = [];

  loadedCheerio(".download-chapter div.title").each(function () {
    chapters.push({
      name: loadedCheerio(this).find("a").attr("title"),
      releaseTime: loadedCheerio(this).find("time").text(),
      url: loadedCheerio(this).find("a").attr("href"),
    });
  });

  novel.chapters = chapters.reverse();
  return novel;
}

async function parseChapter(chapterUrl) {
  const result = await fetchApi(chapterUrl);
  const body = await result.text();
  const loadedCheerio = cheerio.load(body);

  loadedCheerio('div[class="adblock-service"]').remove();
  const chapterText = loadedCheerio('div[class="entry-content"]').html();

  return chapterText;
}

async function searchNovels(searchTerm) {
  const url = `${baseUrl}/?searchrn=${searchTerm}&but=Поиск по названию&sortby=upd`;
  const result = await fetchApi(url);
  let body = await result.text();
  const loadedCheerio = cheerio.load(body);

  let novels = [];
  loadedCheerio('div[class="block-home"] > div[class="one"]').each(function () {
    const name = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("title");
    const cover = loadedCheerio(this)
      .find('div[class="img-home"] > a > img')
      .attr("src")
      .replace("-150x150", "");
    const url = loadedCheerio(this)
      .find('div[class="img-home"] > a')
      .attr("href");

    novels.push({ name, cover, url });
  });

  return novels;
}

const filters = [
  {
    key: "sort",
    label: "Сортировка",
    values: [
      { label: "Имя", value: "alphabet" },
      { label: "Просмотры", value: "count" },
      { label: "Дате добавления", value: "new" },
      { label: "Дате обновления", value: "upd" },
    ],
    inputType: FilterInputs.Picker,
  },
  {
    key: "type",
    label: "Тип",
    values: [
      { label: "Английский", value: "Английский" },
      { label: "Китайский", value: "Китайский" },
      { label: "Корейский", value: "Корейский" },
      { label: "Японский", value: "Японский" },
    ],
    inputType: FilterInputs.Checkbox,
  },
  {
    key: "genres",
    label: "Жанры",
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
];

module.exports = {
  id: pluginId,
  name: sourceName,
  site: baseUrl,
  version: "1.0.0",
  lang: languages.Russian,
  icon: "src/ru/jaomix/icon.png",
  filters,
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
  fetchImage: fetchFile,
};
