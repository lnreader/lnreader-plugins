const cheerio = require("cheerio");
const dayjs = require("dayjs");
const fetchApi = require("@libs/fetchApi");
const fetchFile = require("@libs/fetchFile");
const languages = require("@libs/languages");
const Status = require("@libs/novelStatus");
const FilterInputs = require("@libs/filterInputs");
const defaultCoverUri =
  "https://github.com/LNReader/lnreader-sources/blob/main/icons/src/coverNotAvailable.jpg?raw=true";

const pluginId = "RNRF";
const sourceName = "РанобэРФ";
const baseUrl = "https://ранобэ.рф";

async function popularNovels(page, { showLatestNovels, filters }) {
  let url = baseUrl + "/books?order=";
  url += showLatestNovels ? "lastPublishedChapter" : filters?.sort || "popular";
  url += "&page=" + page;

  const result = await fetchApi(url);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);
  let json = loadedCheerio("#__NEXT_DATA__").html();
  json = JSON.parse(json);

  let novels = [];
  json.props.pageProps.totalData.items.forEach((novel) =>
    novels.push({
      name: novel.title,
      cover: novel?.verticalImage?.url
        ? baseUrl + novel.verticalImage.url
        : defaultCoverUri,
      url: baseUrl + "/" + novel.slug,
    })
  );

  return novels;
}

async function parseNovelAndChapters(novelUrl) {
  const result = await fetchApi(novelUrl);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);
  const json = loadedCheerio("#__NEXT_DATA__").html();
  const book = JSON.parse(json).props.pageProps.book;

  let novel = {
    url: novelUrl,
    name: book.title,
    cover: book?.verticalImage?.url
      ? baseUrl + book.verticalImage.url
      : defaultCoverUri,
    summary: book.description,
    author: book?.author || "",
    genres: book.genres.map((item) => item.title).join(", "),
    status: book.additionalInfo.includes("Активен")
      ? Status.Ongoing
      : Status.Completed,
  };

  let chapters = [];

  book.chapters.forEach((chapter) => {
    if (!chapter.isDonate || chapter.isUserPaid) {
      chapters.push({
        name: chapter.title,
        releaseTime: dayjs(chapter.publishedAt).format("LLL"),
        url: baseUrl + chapter.url,
      });
    }
  });

  novel.chapters = chapters.reverse();
  return novel;
}

async function parseChapter(chapterUrl) {
  const result = await fetchApi(chapterUrl);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);
  let json = loadedCheerio("#__NEXT_DATA__").html();
  json = JSON.parse(json);

  let temp = cheerio.load(json.props.pageProps.chapter.content.text);

  temp("img").each(function () {
    if (!loadedCheerio(this).attr("src")?.startsWith("http")) {
      const src = loadedCheerio(this).attr("src");
      loadedCheerio(this).attr("src", baseUrl + src);
    }
  });

  const chapterText = temp.html();

  return chapterText;
}

async function searchNovels(searchTerm) {
  const url = `${baseUrl}/v3/books?filter[or][0][title][like]=${searchTerm}&filter[or][1][titleEn][like]=${searchTerm}&filter[or][2][fullTitle][like]=${searchTerm}&filter[status][]=active&filter[status][]=abandoned&filter[status][]=completed&expand=verticalImage`;
  const result = await fetchApi(url);
  const body = await result.json();
  let novels = [];

  body.items.forEach((novel) =>
    novels.push({
      name: novel.title,
      cover: novel?.verticalImage?.url
        ? baseUrl + novel.verticalImage.url
        : defaultCoverUri,
      url: baseUrl + "/" + novel.slug,
    })
  );

  return novels;
}

const filters = [
  {
    key: "sort",
    label: "Сортировка",
    values: [
      { label: "Рейтинг", value: "popular" },
      { label: "Дате добавления", value: "new" },
      { label: "Дате обновления", value: "lastPublishedChapter" },
      { label: "Законченные", value: "completed" },
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
  icon: "src/ru/ranoberf/icon.png",
  filters,
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
  fetchImage: fetchFile,
};
