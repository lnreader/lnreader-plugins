import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import { FilterInputs } from "@libs/filterInputs";
import { Chapter, Novel, Plugin } from "@typings/plugin";

export const id = "jaomix.ru";
export const name = "Jaomix";
export const site = "https://jaomix.ru";
export const version = "1.0.0";
export const icon = "src/ru/jaomix/icon.png";

const baseUrl = site;

export const popularNovels: Plugin.popularNovels = async function (
    page,
    { showLatestNovels, filters }
) {
    let url = baseUrl + "/?searchrn&sortby=";
    url += showLatestNovels ? "upd" : filters?.sort || "count";

    if (filters) {
        if (Array.isArray(filters.type) && filters.type.length) {
            url += filters.type.map((i) => `&lang[]=${i}`).join("");
        }

        if (Array.isArray(filters.genres) && filters.genres.length) {
            url += filters.genres.map((i) => `&genre[]=${i}`).join("");
        }
    }

    url += `&page=${page}`;

    const result = await fetchApi(url);
    let body = await result.text();

    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];
    loadedCheerio('div[class="block-home"] > div[class="one"]').each(
        function () {
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
        }
    );

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
            chapters.push({
                name: loadedCheerio(this).find("a").attr("title")!,
                releaseTime: loadedCheerio(this).find("time").text(),
                url: loadedCheerio(this).find("a").attr("href")!,
            });
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
    const url = `${baseUrl}/?searchrn=${searchTerm}&but=Поиск по названию&sortby=upd`;
    const result = await fetchApi(url);
    let body = await result.text();
    const loadedCheerio = parseHTML(body);

    let novels: Novel.Item[] = [];
    loadedCheerio('div[class="block-home"] > div[class="one"]').each(
        function () {
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
        }
    );

    return novels;
};

export const filters = [
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
export const fetchImage: Plugin.fetchImage = fetchFile;
