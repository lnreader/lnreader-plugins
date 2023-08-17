import { ScrpitGeneratorFunction } from "../generate";
import list from "./sources.json";

type sourceData = (typeof list)[number];

export const generateAll: ScrpitGeneratorFunction = function () {
    return list.map((source) => {
        return generator(source);
    });
};

const generator = function generator(sourceJson: sourceData) {
    const pluginId = sourceJson.id;
    const souceName = sourceJson.sourceName;
    const site = sourceJson.sourceSite;
    const filters = sourceJson.filters;
    const filetersString = JSON.stringify(filters).replace(/(\"inputType\":)\s*\"([^\"]+)\"/g, "$1FilterInputs.$2");
    const pluginScript = `
    import { load as parseHTML } from "cheerio";
    // import dayjs from 'dayjs';
    import { fetchFile, fetchApi } from "@libs/fetch";
    import { Novel, Plugin, Chapter } from "@typings/plugin";
    // import { parseMadaraDate } from "@libs/parseMadaraDate";
    // import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
    // import { showToast } from "@libs/showToast";
    import { Filter, FilterInputs } from "@libs/filterInputs";
    import { NovelStatus } from '@libs/novelStatus';
    // import { defaultCover } from "@libs/defaultCover";
    
    
    export const id = "${pluginId}";
    export const name = "${souceName}";
    export const icon = "";
    export const version = "1.0.0";
    export const site = "${site}";
    exports["protected"] = false;
    
    const baseUrl = site;
    
    const customFilters: Filter[] = ${filetersString};
    
    export const filters = [
        {
            key: 'sort',
            label: 'Сортировка',
            values: [
                { label: 'По рейтингу', value: '6' },
                { label: 'По степени готовности', value: '0' },
                { label: 'По названию на языке оригинала', value: '1' },
                { label: 'По названию на языке перевода', value: '2' },
                { label: 'По дате создания', value: '3' },
                { label: 'По дате последней активности', value: '4' },
                { label: 'По просмотрам', value: '5' },
                { label: 'По кол-ву переведённых глав', value: '7' },
                { label: 'По кол-ву лайков', value: '8' },
                { label: 'По кол-ву страниц', value: '10' },
                { label: 'По кол-ву бесплатных глав', value: '11' },
                { label: 'По кол-ву рецензий', value: '12' },
                { label: 'По кол-ву в закладках', value: '13' },
                { label: 'По кол-ву в избранном', value: '14' },
            ],
            inputType: FilterInputs.Picker,
        },
        {
            key: 'type',
            label: 'Тип',
            values: [
                { label: 'Неважно', value: '0' },
                { label: 'Только переводы', value: '1' },
                { label: 'Только авторские', value: '2' },
            ],
            inputType: FilterInputs.Picker,
        },
        {
            key: 'atmosphere',
            label: 'Атмосфера',
            values: [
                { label: 'Неважно', value: '0' },
                { label: 'Позитивная', value: '1' },
                { label: 'Dark', value: '2' },
            ],
            inputType: FilterInputs.Picker,
        },
        {
            key: 'trash',
            label: 'Другое',
            values: [
                { label: 'Готовые на 100%', value: 'ready' },
                { label: 'Доступные для перевода', value: 'tr' },
                { label: 'Доступные для скачивания', value: 'gen' },
                { label: 'Завершённые проекты', value: 'wealth' },
                { label: 'Распродажа', value: 'discount' },
                { label: 'Только онгоинги', value: 'ongoings' },
                { label: 'Убрать машинный', value: 'remove_machinelate' },
            ],
            inputType: FilterInputs.Checkbox,
        },
        ...customFilters,
        {
            key: 'adult',
            label: 'Возрастные ограничения',
            values: [
                { label: 'Все', value: '0' },
                { label: 'Убрать 18+', value: '1' },
                { label: 'Только 18+', value: '2' },
            ],
            inputType: FilterInputs.Picker,
        },
    ];
    
    export const popularNovels: Plugin.popularNovels = async function (
        page,
        { filters, showLatestNovels }
    ) {
        let url = baseUrl + '/search?t=&cat=2';
        url += '&sort=' + showLatestNovels ? '4' : filters?.sort || '6';
        url += '&type=' + filters?.type || '0';
        url += '&atmosphere=' + filters?.atmosphere || '0';
        url += '&adult=' + filters?.adult || '0';
    
        if (filters?.genres instanceof Array) {
            url += filters.genres.map(i => '&genres[]='+i).join('');
        }
    
        if (filters?.tags instanceof Array) {
            url += filters.tags.map(i => '&tags[]='+i).join('');
        }
    
        if (filters?.trash instanceof Array) {
            url += filters.trash.map(i => '&' + i + '=1');
        }
    
        url += '&Book_page=' + page;
    
        const result = await fetchApi(url);
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
    
        const novels: Novel.Item[] = [];
    
        loadedCheerio(
            'ul[class="search-results"] > li:not([class="ad_type_catalog"])',
        ).each(function () {
            novels.push({
                name: loadedCheerio(this).find('p > a').text(),
                cover: baseUrl + loadedCheerio(this).find('img').attr('src'),
                url: baseUrl + loadedCheerio(this).find('p > a').attr('href') || '',
            });
        });
    
        return novels;
    };
    
    
    export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
        async function (novelUrl) {
            const novel: Novel.instance = {
                url: novelUrl,
                chapters: [],
            };
            let result = await fetchApi(novelUrl);
            if (result.url.includes('mature?path=')) {
                const formData = new FormData();
                formData.append('path', novelUrl);
                formData.append('ok', 'Да');
    
                await fetch(result.url, {
                    method: 'POST',
                    body: formData,
                });
    
                result = await fetchApi(novelUrl);
            }
            const body = await result.text();
            const loadedCheerio = parseHTML(body);
    
            novel.name = loadedCheerio('div[class="container"] > div > div > h1')
                .text()
                .trim();
            novel.cover =
                baseUrl + loadedCheerio('div[class="images"] > div img').attr('src');
            novel.summary = loadedCheerio('#Info > div:nth-child(3)').text();
            let genres: string[] = [];
    
            loadedCheerio('div[class="span5"] > p').each(function () {
                switch (loadedCheerio(this).find('strong').text()) {
                    case 'Автор:':
                        novel.author = loadedCheerio(this).find('em > a').text().trim();
                        break;
                    case 'Выпуск:':
                        novel.status =
                            loadedCheerio(this).find('em').text().trim() === 'продолжается'
                                ? NovelStatus.Ongoing
                                : NovelStatus.Completed;
                        break;
                    case 'Тэги:':
                        loadedCheerio(this)
                            .find('em > a')
                            .each(function () {
                                genres.push(loadedCheerio(this).text());
                            });
                        break;
                    case 'Жанры:':
                        loadedCheerio(this)
                            .find('em > a')
                            .each(function () {
                                genres.push(loadedCheerio(this).text());
                            });
                        break;
                }
            });
    
            if (genres.length > 0) {
                novel.genres = genres.reverse().join(',');
            }
    
            const chapters: Chapter.Item[] = [];
            loadedCheerio('table > tbody > tr.chapter_row').each(function () {
                const chapterName = loadedCheerio(this)
                    .find('td[class="t"] > a')
                    .text()
                    .trim();
                const releaseDate = loadedCheerio(this)
                    .find('td > span')
                    .attr('title')
                    ?.trim();
                const chapterUrl = baseUrl + loadedCheerio(this)
                    .find('td[class="t"] > a')
                    .attr('href');
    
                if (
                    loadedCheerio(this).find('td > span[class="disabled"]').length < 1 &&
                    releaseDate
                ) {
                    chapters.push({ name: chapterName, releaseTime: releaseDate, url: chapterUrl });
                }
            });
    
            novel.chapters = chapters;
            return novel;
        };
    
    export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
        let result = await fetchApi(chapterUrl);
        if (result.url.includes('mature?path=')) {
          const formData = new FormData();
          formData.append('ok', 'Да');
    
          await fetch(result.url, {
            method: 'POST',
            body: formData,
          });
    
          result = await fetchApi(chapterUrl);
        }
        const body = await result.text();
        const loadedCheerio = parseHTML(body);
        
        
        const chapterText = loadedCheerio('.content-text').html();
    
    
        return chapterText;
    };
    
    export const searchNovels: Plugin.searchNovels = async (searchTerm) => {
        const novels: Novel.Item[] = [];
        const result = await fetchApi(
            baseUrl + '/search/autocomplete?query=' + searchTerm,
          );
          let json: any = await result.json();
      
          json.forEach((item: any) => {
            const novelName = item.title_one + ' / ' + item.title_two;
            const novelCover = baseUrl + item.img;
            const novelUrl = baseUrl + item.url;
      
            novels.push({ name: novelName, cover: novelCover, url: novelUrl });
          });
      
        return novels;
    };
    
    export const fetchImage: Plugin.fetchImage = async (url) => {
        return await fetchFile(url, {});
    };
    
    `
    return {
        lang: "Russian",
        filename: souceName,
        pluginScript,
    };
};
