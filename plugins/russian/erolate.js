const cheerio = require("cheerio");
const dayjs = require("dayjs");
const fetchApi = require("@libs/fetchApi");
const fetchFile = require("@libs/fetchFile");
const languages = require("@libs/languages");
const Status = require("@libs/novelStatus");
const FilterInputs = require("@libs/filterInputs");
const defaultCoverUri =
  "https://github.com/LNReader/lnreader-sources/blob/main/icons/src/coverNotAvailable.jpg?raw=true";

const pluginId = "EROLATE";
const sourceName = "Erolate";
const baseUrl = "https://erolate.com";

async function popularNovels(page, { showLatestNovels, filters }) {
  let url = baseUrl + "/search?t=&cat=2";
  url += "&sort=" + showLatestNovels ? "4" : filters?.sort || "6";
  url += "&type=" + filters?.type || "0";
  url += "&atmosphere=" + filters?.atmosphere || "0";
  url += "&adult=" + filters?.adult || "0";

  if (filters?.genres?.length) {
    url += filters.genres.map((i) => `&genres[]=${i}`).join("");
  }

  if (filters?.tags?.length) {
    url += filters.tags.map((i) => `&tags[]=${i}`).join("");
  }

  if (filters?.trash?.length) {
    url += filters.trash.map((i) => `&${i}=1`);
  }

  url += `&Book_page=${page}`;

  const result = await fetchApi(url);
  const body = await result.text();
  const loadedCheerio = cheerio.load(body);

  let novels = [];

  loadedCheerio(
    'ul[class="search-results"] > li:not([class="ad_type_catalog"])'
  ).each(function () {
    novels.push({
      name: loadedCheerio(this).find("p > a").text(),
      cover: baseUrl + loadedCheerio(this).find("img").attr("src"),
      url: baseUrl + loadedCheerio(this).find("p > a").attr("href"),
    });
  });

  return novels;
}

async function parseNovelAndChapters(novelUrl) {
  let result = await fetchApi(novelUrl);
  if (result.url.includes("mature?path=")) {
    const formData = new FormData();
    formData.append("path", novelUrl);
    formData.append("ok", "Да");

    await fetchApi(result.url, {
      method: "POST",
      body: formData,
    });

    result = await fetchApi(novelUrl);
  }
  const body = await result.text();
  const loadedCheerio = cheerio.load(body);

  let novel = {
    url: novelUrl,
  };

  novel.name = loadedCheerio('div[class="container"] > div > div > h1')
    .text()
    .trim();
  novel.cover =
    baseUrl + loadedCheerio('div[class="images"] > div img').attr("src");
  novel.summary = loadedCheerio("#Info > div:nth-child(3)").html();
  let genre = [];

  loadedCheerio('div[class="span5"] > p').each(function () {
    switch (loadedCheerio(this).find("strong").text()) {
      case "Автор:":
        novel.author = loadedCheerio(this).find("em > a").text().trim();
        break;
      case "Выпуск:":
        novel.status =
          loadedCheerio(this).find("em").text().trim() === "продолжается"
            ? Status.Ongoing
            : Status.Completed;
        break;
      case "Тэги:":
        loadedCheerio(this)
          .find("em > a")
          .each(function () {
            genre.push(loadedCheerio(this).text());
          });
        break;
      case "Жанры:":
        loadedCheerio(this)
          .find("em > a")
          .each(function () {
            genre.push(loadedCheerio(this).text());
          });
        break;
    }
  });

  if (genre?.length) {
    novel.genres = genre.reverse().join(",");
  }

  let chapters = [];
  loadedCheerio("table > tbody > tr.chapter_row").each(function () {
    const releaseTime = loadedCheerio(this)
      .find("td > span")
      .attr("title")
      ?.trim();

    if (
      loadedCheerio(this).find('td > span[class="disabled"]').length < 1 &&
      releaseTime
    ) {
      const name = loadedCheerio(this).find('td[class="t"] > a').text().trim();
      const url = loadedCheerio(this).find('td[class="t"] > a').attr("href");

      chapters.push({ name, releaseTime, url: baseUrl + url });
    }
  });

  novel.chapters = chapters;
  return novel;
}

async function parseChapter(chapterUrl) {
  let result = await fetchApi(chapterUrl);
  if (result.url.includes("mature?path=")) {
    const formData = new FormData();
    formData.append("path", chapterUrl.replace(baseUrl, ""));
    formData.append("ok", "Да");

    await fetchApi(result.url, {
      method: "POST",
      body: formData,
    });

    result = await fetchApi(chapterUrl);
  }
  const body = await result.text();
  const loadedCheerio = cheerio.load(body);

  loadedCheerio(".content-text img").each(function () {
    if (!loadedCheerio(this).attr("src")?.startsWith("http")) {
      const src = loadedCheerio(this).attr("src");
      loadedCheerio(this).attr("src", baseUrl + src);
    }
  });

  const chapterText = loadedCheerio(".content-text").html();
  return chapterText;
}

async function searchNovels(searchTerm) {
  const result = await fetchApi(
    baseUrl + "/search/autocomplete?query=" + searchTerm
  );
  const json = await result.json();

  let novels = [];
  json.forEach((novel) =>
    novels.push({
      name: novel.title_one + " / " + novel.title_two,
      cover: baseUrl + novel.img,
      url: baseUrl + novel.url,
    })
  );

  return novels;
}

const filters = [
  {
    key: "sort",
    label: "Сортировка",
    values: [
      { label: "По рейтингу", value: "6" },
      { label: "По степени готовности", value: "0" },
      { label: "По названию на языке оригинала", value: "1" },
      { label: "По названию на языке перевода", value: "2" },
      { label: "По дате создания", value: "3" },
      { label: "По дате последней активности", value: "4" },
      { label: "По просмотрам", value: "5" },
      { label: "По кол-ву переведённых глав", value: "7" },
      { label: "По кол-ву лайков", value: "8" },
      { label: "По кол-ву страниц", value: "10" },
      { label: "По кол-ву бесплатных глав", value: "11" },
      { label: "По кол-ву рецензий", value: "12" },
      { label: "По кол-ву в закладках", value: "13" },
      { label: "По кол-ву в избранном", value: "14" },
    ],
    inputType: FilterInputs.Picker,
  },
  {
    key: "type",
    label: "Тип",
    values: [
      { label: "Неважно", value: "0" },
      { label: "Только переводы", value: "1" },
      { label: "Только авторские", value: "2" },
    ],
    inputType: FilterInputs.Picker,
  },
  {
    key: "atmosphere",
    label: "Атмосфера",
    values: [
      { label: "Неважно", value: "0" },
      { label: "Позитивная", value: "1" },
      { label: "Dark", value: "2" },
    ],
    inputType: FilterInputs.Picker,
  },
  {
    key: "trash",
    label: "Другое",
    values: [
      { label: "Готовые на 100%", value: "ready" },
      { label: "Доступные для перевода", value: "tr" },
      { label: "Доступные для скачивания", value: "gen" },
      { label: "Завершённые проекты", value: "wealth" },
      { label: "Распродажа", value: "discount" },
      { label: "Только онгоинги", value: "ongoings" },
      { label: "Убрать машинный", value: "remove_machinelate" },
    ],
    inputType: FilterInputs.Checkbox,
  },
  {
    key: "genres",
    label: "Жанры",
    values: [
      { label: "Анал", value: "2" },
      { label: "Бдсм", value: "3" },
      { label: "Большая грудь", value: "5" },
      { label: "Большая попка", value: "6" },
      { label: "Большой член", value: "7" },
      { label: "Бондаж", value: "8" },
      { label: "В первый раз", value: "9" },
      { label: "В цвете", value: "10" },
      { label: "Гарем", value: "11" },
      { label: "Гендарная интрига", value: "12" },
      { label: "Групповой секс", value: "13" },
      { label: "Детектив", value: "39" },
      { label: "Драма", value: "14" },
      { label: "Зрелые женщины (milf)", value: "15" },
      { label: "Измена", value: "16" },
      { label: "Изнасилование", value: "17" },
      { label: "Инцест", value: "18" },
      { label: "Исторический", value: "19" },
      { label: "Комедия", value: "20" },
      { label: "Контроль над разумом", value: "35" },
      { label: "Маленькая грудь", value: "21" },
      { label: "Мистика", value: "40" },
      { label: "Научная фантастика", value: "22" },
      { label: "Нетораре", value: "23" },
      { label: "Оральный секс", value: "24" },
      { label: "Повседневность", value: "41" },
      { label: "Приключения", value: "38" },
      { label: "Публичный секс", value: "33" },
      { label: "Романтика", value: "25" },
      { label: "С изображениями ", value: "36" },
      { label: "Сверхъестественное", value: "34" },
      { label: "Смат", value: "37" },
      { label: "Тентакли", value: "26" },
      { label: "Трагедия", value: "27" },
      { label: "Ужасы", value: "28" },
      { label: "Фантастика", value: "32" },
      { label: "Фэнтези", value: "29" },
      { label: "Чикан", value: "30" },
      { label: "Этти", value: "31" },
      { label: "Ahegao", value: "1" },
    ],
    inputType: FilterInputs.Checkbox,
  },
  {
    key: "tags",
    label: "Тэги",
    values: [
      { label: "+18", value: "141" },
      { label: "18+", value: "200" },
      { label: "21+", value: "334" },
      { label: "Адекватные главные герои", value: "253" },
      { label: "Азартные игры", value: "210" },
      { label: "Айдолы", value: "364" },
      { label: "Акула", value: "53" },
      { label: "Альтернативное развитие событий", value: "338" },
      { label: "Аморальный главный герой", value: "219" },
      { label: "Анал", value: "7" },
      { label: "Анальный секс", value: "67" },
      { label: "Ангелы", value: "114" },
      { label: "Антигерой", value: "226" },
      { label: "Аристократия", value: "260" },
      { label: "Артефакт", value: "379" },
      { label: "Афродизиак", value: "276" },
      { label: "Ахегао", value: "240" },
      { label: "Бабушка беременна от внука", value: "393" },
      { label: "Бабушка и внук", value: "380" },
      { label: "Бдсм", value: "131" },
      { label: "Беременность", value: "148" },
      { label: "Бесплатно", value: "79" },
      { label: "Бесстрашные персонажи", value: "339" },
      { label: "Библиотека", value: "265" },
      { label: "Бистиалити", value: "391" },
      { label: "Близнецы", value: "198" },
      { label: "Блондинка", value: "91" },
      { label: "Богатые персонажи", value: "248" },
      { label: "Боги", value: "115" },
      { label: "Боевик", value: "252" },
      { label: "Большая грудь", value: "33" },
      { label: "Большая попка", value: "328" },
      { label: "Большой член", value: "76" },
      { label: "Большой член сына", value: "396" },
      { label: "Босс и подчиненный", value: "330" },
      { label: "Брак", value: "182" },
      { label: "Брак по расчёту", value: "346" },
      { label: "Брат", value: "29" },
      { label: "Брат и сестра", value: "30" },
      { label: "Брюнетка", value: "28" },
      { label: "Бэтмен", value: "369" },
      { label: "Бэтмен", value: "170" },
      { label: "В первый раз", value: "179" },
      { label: "Вагинальный секс", value: "57" },
      { label: "Вагинальный секс", value: "171" },
      { label: "Вайурист", value: "9" },
      { label: "Вампиры", value: "133" },
      { label: "Ван-пис", value: "335" },
      { label: "Веб камера", value: "289" },
      { label: "Ведьмы", value: "232" },
      { label: "Викинги", value: "307" },
      { label: "Виртуальная реальность", value: "382" },
      { label: "Вирус", value: "203" },
      { label: "Внучка", value: "189" },
      { label: "Война", value: "387" },
      { label: "Время", value: "81" },
      { label: "Второй шанс", value: "244" },
      { label: "Вуайеризм", value: "62" },
      { label: "Выживание", value: "135" },
      { label: "Гарем", value: "107" },
      { label: "Гарри поттер", value: "97" },
      { label: "Гг имба", value: "87" },
      { label: "Генетические модификации", value: "314" },
      { label: "Гипноз", value: "143" },
      { label: "Главная героиня девушка", value: "147" },
      { label: "Главный герой женщина", value: "213" },
      { label: "Главный герой извращенец", value: "116" },
      { label: "Главный герой мужчина", value: "117" },
      { label: "Глубокое горло", value: "94" },
      { label: "Гоблины", value: "230" },
      { label: "Город", value: "139" },
      { label: "Городское фэнтези", value: "297" },
      { label: "Грудное молоко", value: "225" },
      { label: "Групповой секс", value: "72" },
      { label: "Гэнг-бэнг", value: "235" },
      { label: "Гяру", value: "222" },
      { label: "Двойное проникновение", value: "42" },
      { label: "Двойной анал", value: "47" },
      { label: "Дворяне", value: "246" },
      { label: "Деамоны старший школы", value: "291" },
      { label: "Девственница", value: "119" },
      { label: "Девушки-монстры", value: "223" },
      { label: "Демоны", value: "98" },
      { label: "Детектив", value: "249" },
      { label: "Дзёсэй", value: "259" },
      { label: "Доктор", value: "326" },
      { label: "Дом", value: "138" },
      { label: "Доминирование", value: "18" },
      { label: "Дочь", value: "153" },
      { label: "Дочь беременна от отца", value: "348" },
      { label: "Древние времена", value: "383" },
      { label: "Древний китай", value: "261" },
      { label: "Другой мир", value: "365" },
      { label: "Дружба", value: "325" },
      { label: "Друзья детства", value: "183" },
      { label: "Дядя", value: "160" },
      { label: "Жена", value: "70" },
      { label: "Жена и муж", value: "99" },
      { label: "Жена шлюха", value: "236" },
      { label: "Женское доминирование", value: "100" },
      { label: "Жесткий секс", value: "283" },
      { label: "Жёсткий секс", value: "101" },
      { label: "Жестокие персонажи", value: "254" },
      { label: "Жестокий мир", value: "336" },
      { label: "Жестокость", value: "123" },
      { label: "Заботливый главный герой", value: "340" },
      { label: "Зависимость", value: "370" },
      { label: "Заключение", value: "196" },
      { label: "Заключённые", value: "384" },
      { label: "Замок", value: "140" },
      { label: "Запретная любовь", value: "273" },
      { label: "Заражение", value: "206" },
      { label: "Звёздные войны", value: "120" },
      { label: "Зверодевочки", value: "158" },
      { label: "Зло", value: "343" },
      { label: "Золовка", value: "77" },
      { label: "Золотой дождь", value: "146" },
      { label: "Зомби апокалипсис", value: "241" },
      { label: "Зоофилия", value: "144" },
      { label: "Игровые элементы", value: "385" },
      { label: "Извращения", value: "192" },
      { label: "Измена", value: "71" },
      { label: "Изменения внешности", value: "315" },
      { label: "Изменения личности", value: "316" },
      { label: "Изнасилование", value: "275" },
      { label: "Изуку мидория", value: "337" },
      { label: "Ино", value: "127" },
      { label: "Инопланетяне", value: "304" },
      { label: "Интересный сюжет", value: "349" },
      { label: "Интимные сцены", value: "322" },
      { label: "Интриги и заговоры", value: "262" },
      { label: "Интроверт", value: "38" },
      { label: "Инфекция", value: "207" },
      { label: "Инцест", value: "35" },
      { label: "Камера", value: "92" },
      { label: "Колледж", value: "82" },
      { label: "Комикс", value: "286" },
      { label: "Контроль", value: "19" },
      { label: "Контроль над разумом", value: "181" },
      { label: "Контроль разума", value: "65" },
      { label: "Кончил внутрь", value: "221" },
      { label: "Королевская семья", value: "358" },
      { label: "Коррупция", value: "49" },
      { label: "Космос", value: "204" },
      { label: "Красивая главная героиня", value: "255" },
      { label: "Красивые женщины", value: "321" },
      { label: "Красивый главный герой", value: "266" },
      { label: "Ксенофилия", value: "386" },
      { label: "Кулинария", value: "362" },
      { label: "Культвация", value: "86" },
      { label: "Кунилингус", value: "152" },
      { label: "Лактация", value: "11" },
      { label: "Лишение девственности", value: "212" },
      { label: "Лоли", value: "218" },
      { label: "Лунатизм", value: "279" },
      { label: "Любовь", value: "89" },
      { label: "Магический мир", value: "357" },
      { label: "Магия", value: "80" },
      { label: "Мама", value: "3" },
      { label: "Мама беременна от сына", value: "274" },
      { label: "Мама и дочь", value: "163" },
      { label: "Мама и сын", value: "1" },
      { label: "Мама супермена", value: "39" },
      { label: "Манипуляция временем", value: "292" },
      { label: "Марвел", value: "290" },
      { label: "Марвел", value: "173" },
      { label: "Марти стью", value: "102" },
      { label: "Массаж", value: "224" },
      { label: "Мастурбация", value: "63" },
      { label: "Мать", value: "239" },
      { label: "Мать и дочь", value: "381" },
      { label: "Мать и сын", value: "237" },
      { label: "Мафия", value: "256" },
      { label: "Мачеха", value: "197" },
      { label: "Мачеха беременна от сына", value: "395" },
      { label: "Мачеха и сын", value: "394" },
      { label: "Медсестра", value: "341" },
      { label: "Межрассовый", value: "54" },
      { label: "Месть", value: "306" },
      { label: "Меха", value: "268" },
      { label: "Ми", value: "243" },
      { label: "Милф", value: "34" },
      { label: "Милф", value: "180" },
      { label: "Минет", value: "52" },
      { label: "Мистика", value: "250" },
      { label: "Младшая сестра", value: "154" },
      { label: "Модель", value: "324" },
      { label: "Монстры", value: "333" },
      { label: "Мошеничество", value: "44" },
      { label: "Мужская беременность", value: "363" },
      { label: "Мужчина протагонист", value: "108" },
      { label: "Музыка", value: "331" },
      { label: "Мэри съюха", value: "309" },
      { label: "Наруто", value: "46" },
      { label: "Насилие", value: "128" },
      { label: "Насилие и жестокость", value: "193" },
      { label: "Научный эксперимент", value: "313" },
      { label: "Нежить", value: "373" },
      { label: "Некромантия", value: "298" },
      { label: "Ненормативная лексика", value: "124" },
      { label: "Нетораре", value: "69" },
      { label: "Нетори", value: "284" },
      { label: "Нижнее бельё", value: "392" },
      { label: "Ниндзя", value: "296" },
      { label: "Ношеные трусики", value: "166" },
      { label: "Нудизм", value: "156" },
      { label: "Няня", value: "88" },
      { label: "Обмен женами", value: "78" },
      { label: "Оборотни", value: "136" },
      { label: "Обратный гарем", value: "214" },
      { label: "Одержимость", value: "345" },
      { label: "Омегаверс", value: "368" },
      { label: "Оплодотворение", value: "157" },
      { label: "Оральный секс", value: "10" },
      { label: "Оргия", value: "356" },
      { label: "Орки", value: "388" },
      { label: "От слабого к сильному", value: "351" },
      { label: "Отец", value: "2" },
      { label: "Отец делится с сыном", value: "6" },
      { label: "Отец и дочь", value: "205" },
      { label: "Отец куколд", value: "272" },
      { label: "Офис", value: "234" },
      { label: "Падчерица", value: "271" },
      { label: "Пайзури", value: "195" },
      { label: "Папа и дочь", value: "360" },
      { label: "Паразиты", value: "208" },
      { label: "Параллельный мир", value: "320" },
      { label: "Пародия", value: "371" },
      { label: "Первый раз", value: "159" },
      { label: "Перемещение в другой мир", value: "347" },
      { label: "Перемещение во времени", value: "245" },
      { label: "Перерождение", value: "109" },
      { label: "Перерождение в злодея", value: "202" },
      { label: "Пирсинг", value: "145" },
      { label: "Писатель", value: "267" },
      { label: "Планомерное развитие событий", value: "350" },
      { label: "Повседневность", value: "247" },
      { label: "Подглядывание", value: "280" },
      { label: "Подчинение", value: "106" },
      { label: "Подчинение и унижение", value: "211" },
      { label: "Поедание киски", value: "26" },
      { label: "Покемоны", value: "132" },
      { label: "Покорная", value: "8" },
      { label: "Полигамия", value: "352" },
      { label: "Половое воспитание", value: "37" },
      { label: "Полулюди", value: "231" },
      { label: "Попаданец", value: "103" },
      { label: "Попадание в книгу", value: "361" },
      { label: "Порка", value: "20" },
      { label: "Порно", value: "278" },
      { label: "Постапокалипсис", value: "332" },
      { label: "Потеря девственности", value: "142" },
      { label: "Похищение", value: "161" },
      { label: "Приключения", value: "134" },
      { label: "Принуждение", value: "66" },
      { label: "Психология", value: "238" },
      { label: "Публично", value: "85" },
      { label: "Публичный секс", value: "233" },
      { label: "Раб", value: "353" },
      { label: "Рабы", value: "308" },
      { label: "Разват", value: "58" },
      { label: "Разврат", value: "64" },
      { label: "Райзен", value: "95" },
      { label: "Раса инопланетных космических лесбиянок", value: "294" },
      { label: "Рестленг", value: "84" },
      { label: "Риас гремори", value: "389" },
      { label: "Романтика", value: "178" },
      { label: "Рыжий", value: "90" },
      { label: "Сакура", value: "126" },
      { label: "Самолет", value: "93" },
      { label: "Санса старк", value: "277" },
      { label: "Санта", value: "372" },
      { label: "Свадьба", value: "73" },
      { label: "Сверхсила", value: "228" },
      { label: "Сверхъестественное", value: "319" },
      { label: "Свингеры", value: "201" },
      { label: "Свободные отношения", value: "186" },
      { label: "Связывание", value: "137" },
      { label: "Сёдзе", value: "264" },
      { label: "Секс", value: "21" },
      { label: "Секс без проникновения", value: "68" },
      { label: "Секс втроем", value: "43" },
      { label: "Секс игрушки", value: "59" },
      { label: "Секс рабыня", value: "55" },
      { label: "Секс с монстрами", value: "56" },
      { label: "Секс с учителем", value: "184" },
      { label: "Секса будет много", value: "151" },
      { label: "Сексуальное желание", value: "209" },
      { label: "Селфцест", value: "397" },
      { label: "Семья", value: "5" },
      { label: "Сестра", value: "31" },
      { label: "Сестра беременна от брата", value: "355" },
      { label: "Сильный с самого начала", value: "112" },
      { label: "Симбиоз", value: "50" },
      { label: "Сирена", value: "51" },
      { label: "Система", value: "104" },
      { label: "Сиськи", value: "285" },
      { label: "Сквирт", value: "164" },
      { label: "Скрытый секс", value: "287" },
      { label: "Служанка", value: "215" },
      { label: "Соб", value: "281" },
      { label: "Соблазнение", value: "162" },
      { label: "Современность", value: "217" },
      { label: "Соколиный Глаз", value: "176" },
      { label: "Соперничество", value: "216" },
      { label: "Соседи", value: "61" },
      { label: "Соседка", value: "312" },
      { label: "Сперма", value: "229" },
      { label: "Сперма на лицо", value: "199" },
      { label: "Спящие", value: "187" },
      { label: "Старшая сестра", value: "311" },
      { label: "Стеб", value: "111" },
      { label: "Студенты", value: "177" },
      { label: "Суккуб", value: "390" },
      { label: "Супергерои", value: "305" },
      { label: "Суперспособности", value: "300" },
      { label: "Сын", value: "4" },
      { label: "Твинцест", value: "188" },
      { label: "Темное фэнтези", value: "293" },
      { label: "Тентакли", value: "303" },
      { label: "Тетя", value: "113" },
      { label: "Тетя беременна от племянника", value: "376" },
      { label: "Тетя и племянник", value: "377" },
      { label: "Техника", value: "302" },
      { label: "Технологии", value: "301" },
      { label: "Тёща", value: "270" },
      { label: "Тиран", value: "310" },
      { label: "Трагическое прошлое", value: "251" },
      { label: "Трансмиграция", value: "269" },
      { label: "Трансформация", value: "317" },
      { label: "Триллер", value: "344" },
      { label: "Трусики", value: "165" },
      { label: "Убийства", value: "258" },
      { label: "Удача", value: "299" },
      { label: "Ужасы", value: "375" },
      { label: "Улучшение тела", value: "288" },
      { label: "Умная главная героиня", value: "242" },
      { label: "Умные персонажи", value: "257" },
      { label: "Умный главный герой", value: "354" },
      { label: "Университет", value: "323" },
      { label: "Ученик", value: "83" },
      { label: "Ф", value: "149" },
      { label: "Фанатичная любовь", value: "366" },
      { label: "Фанаты", value: "367" },
      { label: "Фантастика", value: "295" },
      { label: "Фанфик", value: "40" },
      { label: "Фелляция", value: "22" },
      { label: "Ферма", value: "191" },
      { label: "Фетиш", value: "60" },
      { label: "Флэш", value: "121" },
      { label: "Футанария", value: "150" },
      { label: "Фэнтези", value: "359" },
      { label: "Хентай", value: "75" },
      { label: "Хината", value: "110" },
      { label: "Холодная главная героиня", value: "263" },
      { label: "Черная вдова", value: "220" },
      { label: "Черная Вдова", value: "175" },
      { label: "Черный юмор", value: "374" },
      { label: "Читерство", value: "45" },
      { label: "Чтение мыслей", value: "227" },
      { label: "Чудовища", value: "378" },
      { label: "Шантаж", value: "129" },
      { label: "Школа", value: "118" },
      { label: "Школьная жизнь", value: "318" },
      { label: "Шлюха", value: "32" },
      { label: "Шоу-бизнес", value: "329" },
      { label: "Шоу-бизнес", value: "172" },
      { label: "Эксгибиционизм", value: "74" },
      { label: "Элементы бдсм", value: "185" },
      { label: "Эмма уотсон", value: "342" },
      { label: "Эмма Уотсон", value: "169" },
      { label: "Эротика", value: "36" },
      { label: "Этти", value: "327" },
      { label: "Юмор", value: "105" },
      { label: "Яндере", value: "155" },
      { label: "Bl", value: "125" },
      { label: "Gl", value: "96" },
      { label: "Harry potter", value: "190" },
      { label: "Harry potter", value: "168" },
      { label: "Hentai", value: "282" },
      { label: "Marvel", value: "194" },
      { label: "Marvel", value: "174" },
      { label: "Milf", value: "167" },
    ],
    inputType: FilterInputs.Checkbox,
  },
  {
    key: "adult",
    label: "Возрастные ограничения",
    values: [
      { label: "Все", value: "0" },
      { label: "Убрать 18+", value: "1" },
      { label: "Только 18+", value: "2" },
    ],
    inputType: FilterInputs.Picker,
  },
];

module.exports = {
  id: pluginId,
  name: sourceName,
  site: baseUrl,
  version: "1.0.0",
  lang: languages.Russian,
  icon: "src/ru/erolate/icon.png",
  filters,
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
  fetchImage: fetchFile,
};
