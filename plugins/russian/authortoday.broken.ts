import cheerio from "cheerio";
import dayjs from "dayjs";
import { fetchApi } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { FilterInputs } from "@libs/filterInputs";
import { Chapter, Novel, Plugin } from "@typings/plugin";
import { defaultCover } from "@libs/defaultCover";

export const id = "AT";
export const name = "Автор Тудей";
export const site = "https://author.today";
export const version = "1.0.0";
export const icon = "src/ru/authortoday/icon.png";

const baseUrl = site;
const apiUrl = "https://api.author.today/";

const token = "Bearer guest";
export const popularNovels: Plugin.popularNovels = async function (
    page,
    { showLatestNovels, filters }
) {
    let url = apiUrl + "v1/catalog/search?page=" + page;
    if (filters?.genre) {
        url += "&genre=" + filters.genre;
    }

    url +=
        "&sorting=" +
        (showLatestNovels ? "recent" : filters?.sort || "popular");

    url += "&form=" + (filters?.form || "any");
    url += "&state=" + (filters?.state || "any");
    url += "&series=" + (filters?.series || "any");
    url += "&access=" + (filters?.access || "any");
    url += "&promo=" + (filters?.promo || "hide");

    const result = await fetchApi(url, {
        headers: {
            Authorization: token,
        },
    });
    const json = await result.json();

    if (json?.code === "NotFound") {
        return [];
    }

    let novels: Novel.Item[] = [];
    json.searchResults.forEach((novel) =>
        novels.push({
            name: novel.title,
            cover: novel?.coverUrl
                ? "https://cm.author.today/content/" + novel.coverUrl
                : defaultCover,
            url: baseUrl + "/work/" + novel.id,
        })
    );

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const workID = novelUrl.split("/")[4];
        let result = await fetchApi(`${apiUrl}v1/work/${workID}/details`, {
            headers: {
                Authorization: token,
            },
        });

        let json = await result.json();
        let novel: Novel.instance = {
            url: novelUrl,
            name: json.title,
            cover: json?.coverUrl ? json.coverUrl.split("?")[0] : defaultCover,
            author:
                json?.originalAuthor ||
                json?.authorFIO ||
                json?.coAuthorFIO ||
                json?.secondCoAuthorFIO ||
                json?.translator ||
                "",
            genres: json?.tags?.join(", "),
            status: json?.isFinished
                ? NovelStatus.Completed
                : NovelStatus.Ongoing,
        };

        novel.summary = "";
        novel.summary += json?.annotation ? json.annotation + "\n" : "";
        novel.summary += json?.authorNotes
            ? "Примечания автора:\n" + json.authorNotes
            : "";
        // all chapters
        result = await fetchApi(`${apiUrl}v1/work/${workID}/content`, {
            headers: {
                Authorization: token,
            },
        });
        json = await result.json();

        let chapters: Chapter.Item[] = [];
        json?.forEach((chapter, index) => {
            if (chapter?.isAvailable && !chapter?.isDraft) {
                chapters.push({
                    name: chapter?.title || `Глава ${index + 1}`,
                    releaseTime: dayjs(
                        chapter?.publishTime || chapter.lastModificationTime
                    ).format("LLL"),
                    url: `${apiUrl}v1/work/${workID}/chapter/${chapter.id}/text`,
                });
            }
        });

        novel.chapters = chapters;
        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const result = await fetchApi(chapterUrl, {
        headers: {
            Authorization: token,
        },
    });
    const json = await result.json();

    if (json?.code) {
        return json.code + "\n" + json?.message;
    }

    let key = json.key.split("").reverse().join("") + "@_@";
    let text = "";

    for (let i = 0; i < json.text.length; i++) {
        text += String.fromCharCode(
            json.text.charCodeAt(i) ^ key.charCodeAt(Math.floor(i % key.length))
        );
    }

    const loadedCheerio = cheerio.load(text);
    loadedCheerio("img").each(function () {
        if (!loadedCheerio(this).attr("src")?.startsWith("http")) {
            const src = loadedCheerio(this).attr("src");
            loadedCheerio(this).attr("src", baseUrl + src);
        }
    });
    const chapterText = loadedCheerio.html();
    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}/search?category=works&q=${searchTerm}`;
    const result = await fetchApi(url, {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:104.0) Gecko/20100101 Firefox/104.0",
        referer: baseUrl,
    });
    const body = await result.text();
    const loadedCheerio = cheerio.load(body);
    let novels: Novel.Item[] = [];

    loadedCheerio("div.book-row").each(function () {
        const name = loadedCheerio(this)
            .find('div[class="book-title"] a')
            .text()
            .trim();
        let cover = loadedCheerio(this).find("img").attr("src");
        const url =
            baseUrl +
            "/work/" +
            loadedCheerio(this)
                .find('div[class="book-title"] a')
                .attr("href")
                ?.split("/")[2];

        if (cover) {
            cover = cover.split("?")[0];
        } else {
            cover = defaultCover;
        }

        novels.push({ name, cover, url });
    });

    return novels;
};

export const filters = [
    {
        key: "sort",
        label: "Сортировка",
        values: [
            { label: "По популярности", value: "popular" },
            { label: "По количеству лайков", value: "likes" },
            { label: "По комментариям", value: "comments" },
            { label: "По новизне", value: "recent" },
            { label: "По просмотрам", value: "views" },
            { label: "Набирающие популярность", value: "trending" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "genre",
        label: "Жанры",
        values: [
            { label: "Альтернативная история", value: "sf-history" },
            { label: "Антиутопия", value: "dystopia" },
            { label: "Бизнес-литература", value: "biznes-literatura" },
            { label: "Боевая фантастика", value: "sf-action" },
            { label: "Боевик", value: "action" },
            { label: "Боевое фэнтези", value: "fantasy-action" },
            { label: "Бояръ-Аниме", value: "boyar-anime" },
            { label: "Героическая фантастика", value: "sf-heroic" },
            { label: "Героическое фэнтези", value: "heroic-fantasy" },
            { label: "Городское фэнтези", value: "urban-fantasy" },
            { label: "Детектив", value: "detective" },
            { label: "Детская литература", value: "detskaya-literatura" },
            { label: "Документальная проза", value: "non-fiction" },
            { label: "Историческая проза", value: "historical-fiction" },
            {
                label: "Исторические приключения",
                value: "historical-adventure",
            },
            { label: "Исторический детектив", value: "historical-mystery" },
            {
                label: "Исторический любовный роман",
                value: "historical-romance",
            },
            { label: "Историческое фэнтези", value: "historical-fantasy" },
            { label: "Киберпанк", value: "cyberpunk" },
            { label: "Короткий любовный роман", value: "short-romance" },
            { label: "Космическая фантастика", value: "sf-space" },
            { label: "ЛитРПГ", value: "litrpg" },
            { label: "Любовное фэнтези", value: "love-fantasy" },
            { label: "Любовные романы", value: "romance" },
            { label: "Мистика", value: "paranormal" },
            { label: "Назад в СССР", value: "back-to-ussr" },
            { label: "Научная фантастика", value: "science-fiction" },
            { label: "Подростковая проза", value: "teen-prose" },
            { label: "Политический роман", value: "political-fiction" },
            { label: "Попаданцы", value: "popadantsy" },
            { label: "Попаданцы в космос", value: "popadantsy-v-kosmos" },
            {
                label: "Попаданцы в магические миры",
                value: "popadantsy-v-magicheskie-miry",
            },
            { label: "Попаданцы во времени", value: "popadantsy-vo-vremeni" },
            { label: "Постапокалипсис", value: "postapocalyptic" },
            { label: "Поэзия", value: "poetry" },
            { label: "Приключения", value: "adventure" },
            { label: "Публицистика", value: "publicism" },
            { label: "Развитие личности", value: "razvitie-lichnosti" },
            { label: "Разное", value: "other" },
            { label: "РеалРПГ", value: "realrpg" },
            { label: "Романтическая эротика", value: "romantic-erotika" },
            { label: "Сказка", value: "fairy-tale" },
            { label: "Современная проза", value: "modern-prose" },
            {
                label: "Современный любовный роман",
                value: "contemporary-romance",
            },
            { label: "Социальная фантастика", value: "sf-social" },
            { label: "Стимпанк", value: "steampunk" },
            { label: "Темное фэнтези", value: "dark-fantasy" },
            { label: "Триллер", value: "thriller" },
            { label: "Ужасы", value: "horror" },
            { label: "Фантастика", value: "sci-fi" },
            {
                label: "Фантастический детектив",
                value: "detective-science-fiction",
            },
            { label: "Фанфик", value: "fanfiction" },
            { label: "Фэнтези", value: "fantasy" },
            { label: "Шпионский детектив", value: "spy-mystery" },
            { label: "Эпическое фэнтези", value: "epic-fantasy" },
            { label: "Эротика", value: "erotica" },
            { label: "Эротическая фантастика", value: "sf-erotika" },
            { label: "Эротический фанфик", value: "fanfiction-erotika" },
            { label: "Эротическое фэнтези", value: "fantasy-erotika" },
            { label: "Юмор", value: "humor" },
            { label: "Юмористическая фантастика", value: "sf-humor" },
            { label: "Юмористическое фэнтези", value: "ironical-fantasy" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "form",
        label: "Форма произведения",
        values: [
            { label: "Любой", value: "any" },
            { label: "Перевод", value: "translation" },
            { label: "Повесть", value: "tale" },
            { label: "Рассказ", value: "story" },
            { label: "Роман", value: "novel" },
            { label: "Сборник поэзии", value: "poetry" },
            { label: "Сборник рассказов", value: "story-book" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "state",
        label: "Статус произведения",
        values: [
            { label: "Любой статус", value: "any" },
            { label: "В процессе", value: "in-progress" },
            { label: "Завершено", value: "finished" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "series",
        label: "Статус цикла",
        values: [
            { label: "Не важно", value: "any" },
            { label: "Вне цикла", value: "out" },
            { label: "Цикл завершен", value: "finished" },
            { label: "Цикл не завершен", value: "unfinished" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "access",
        label: "Тип доступа",
        values: [
            { label: "Любой", value: "any" },
            { label: "Платный", value: "paid" },
            { label: "Бесплатный", value: "free" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "promo",
        label: "Промо-фрагмент",
        values: [
            { label: "Скрывать", value: "hide" },
            { label: "Показывать", value: "show" },
        ],
        inputType: FilterInputs.Picker,
    },
];
