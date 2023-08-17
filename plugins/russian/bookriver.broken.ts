import cheerio from "cheerio";
import dayjs from "dayjs";
import { fetchApi } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { FilterInputs } from "@libs/filterInputs";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "bookriver";
export const name = "Bookriver";
export const site = "https://bookriver.ru";
export const version = "1.0.0";
export const icon = "src/ru/bookriver/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (
    page,
    { showLatestNovels, filters }
) {
    let url = baseUrl + `/genre?page=${page}&perPage=24&sortingType=`;
    url += showLatestNovels ? "last-update" : filters?.sort || "bestseller";

    if (filters) {
        if (Array.isArray(filters.genres) && filters.genres.length) {
            url += "&g=" + filters.genres.join(",");
        }
    }

    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = cheerio.load(body);
    let json = loadedCheerio("#__NEXT_DATA__").html();
    json = JSON.parse(json);

    let novels: Novel.Item[] = [];
    json.props.pageProps.state.pagesFilter.genre.books.forEach((novel) =>
        novels.push({
            name: novel.name,
            cover: novel.coverImages[0].url,
            url: baseUrl + "/book/" + novel.slug,
        })
    );

    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const result = await fetchApi(novelUrl);
        const body = await result.text();

        const loadedCheerio = cheerio.load(body);
        const json = loadedCheerio("#__NEXT_DATA__").html();
        const book = JSON.parse(json).props.pageProps.state.book.bookPage;

        let novel: Novel.instance = {
            url: novelUrl,
            name: book.name,
            cover: book.coverImages[0].url,
            summary: book.annotation,
            author: book.author.name,
            genres: book.tags.map((item) => item.name).join(", "),
            status:
                book.statusComplete === "writing"
                    ? NovelStatus.Ongoing
                    : NovelStatus.Completed,
        };

        let chapters: Chapter.Item[] = [];

        book.ebook.chapters.forEach((chapter) => {
            if (chapter.available) {
                chapters.push({
                    name: chapter.name,
                    releaseTime: dayjs(
                        chapter?.firstPublishedAt || chapter.createdAt
                    ).format("LLL"),
                    url:
                        baseUrl +
                        "/reader/" +
                        book.slug +
                        "/" +
                        chapter.chapterId,
                });
            }
        });

        novel.chapters = chapters;
        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    const url = "https://api.bookriver.ru/api/v1/books/chapter/text/";
    const result = await fetchApi(url + chapterUrl.split("/").pop());
    const json = await result.json();

    const chapterText = json.data.content;
    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const url = `${baseUrl}/search/books?keyword=${searchTerm}`;
    const result = await fetchApi(url);
    const body = await result.text();

    const loadedCheerio = cheerio.load(body);
    let json = loadedCheerio("#__NEXT_DATA__").html();
    json = JSON.parse(json);

    let novels: Novel.Item[] = [];
    json.props.pageProps.state.catalog.books.books.forEach((novel) =>
        novels.push({
            name: novel.name,
            cover: novel.coverImages[0].url,
            url: baseUrl + "/book/" + novel.slug,
        })
    );

    return novels;
};

export const filters = [
    {
        key: "sort",
        label: "Сортировка",
        values: [
            { label: "Бестселлеры", value: "bestseller" },
            { label: "Дате добавления", value: "newest" },
            { label: "Дате обновления", value: "last-update" },
        ],
        inputType: FilterInputs.Picker,
    },
    {
        key: "genres",
        label: "жанры",
        values: [
            {
                label: "Альтернативная история",
                value: "alternativnaya-istoriya",
            },
            { label: "Боевая фантастика", value: "boevaya-fantastika" },
            { label: "Боевое фэнтези", value: "boevoe-fentezi" },
            { label: "Бытовое фэнтези", value: "bytovoe-fentezi" },
            {
                label: "Героическая фантастика",
                value: "geroicheskaya-fantastika",
            },
            { label: "Героическое фэнтези", value: "geroicheskoe-fentezi" },
            { label: "Городское фэнтези", value: "gorodskoe-fentezi" },
            { label: "Детектив", value: "detektiv" },
            {
                label: "Детективная фантастика",
                value: "detektivnaya-fantastika",
            },
            { label: "Жёсткая эротика", value: "zhyostkaya-erotika" },
            { label: "Исторический детектив", value: "istoricheskii-detektiv" },
            {
                label: "Исторический любовный роман",
                value: "istoricheskii-lyubovnyi-roman",
            },
            { label: "Историческое фэнтези", value: "istoricheskoe-fentezi" },
            { label: "Киберпанк", value: "kiberpank" },
            { label: "Классический детектив", value: "klassicheskii-detektiv" },
            {
                label: "Короткий любовный роман",
                value: "korotkii-lyubovnyi-roman",
            },
            {
                label: "Космическая фантастика",
                value: "kosmicheskaya-fantastika",
            },
            { label: "Криминальный детектив", value: "kriminalnyi-detektiv" },
            { label: "ЛитРПГ", value: "litrpg" },
            { label: "Любовная фантастика", value: "lyubovnaya-fantastika" },
            { label: "Любовное фэнтези", value: "lyubovnoe-fentezi" },
            { label: "Любовный роман", value: "lyubovnyi-roman" },
            { label: "Мистика", value: "mistika" },
            { label: "Молодежная проза", value: "molodezhnaya-proza" },
            { label: "Научная фантастика", value: "nauchnaya-fantastika" },
            {
                label: "Остросюжетный любовный роман",
                value: "ostrosyuzhetnyi-lyubovnyi-roman",
            },
            { label: "Политический детектив", value: "politicheskii-detektiv" },
            { label: "Попаданцы", value: "popadantsy" },
            { label: "Постапокалипсис", value: "postapokalipsis" },
            {
                label: "Приключенческое фэнтези",
                value: "priklyuchencheskoe-fentezi",
            },
            {
                label: "Романтическая эротика",
                value: "romanticheskaya-erotika",
            },
            { label: "С элементами эротики", value: "s-elementami-erotiki" },
            { label: "Славянское фэнтези", value: "slavyanskoe-fentezi" },
            {
                label: "Современный любовный роман",
                value: "sovremennyi-lyubovnyi-roman",
            },
            { label: "Социальная фантастика", value: "sotsialnaya-fantastika" },
            { label: "Тёмное фэнтези", value: "temnoe-fentezi" },
            { label: "Фантастика", value: "fantastika" },
            { label: "Фэнтези", value: "fentezi" },
            { label: "Шпионский детектив", value: "shpionskii-detektiv" },
            { label: "Эпическое фэнтези", value: "epicheskoe-fentezi" },
            { label: "Эротика", value: "erotika" },
            {
                label: "Эротическая фантастика",
                value: "eroticheskaya-fantastika",
            },
            { label: "Эротический фанфик", value: "eroticheskii-fanfik" },
            { label: "Эротическое фэнтези", value: "eroticheskoe-fentezi" },
            {
                label: "Юмористический детектив",
                value: "yumoristicheskii-detektiv",
            },
            {
                label: "Юмористическое фэнтези",
                value: "yumoristicheskoe-fentezi",
            },
        ],
        inputType: FilterInputs.Checkbox,
    },
];
