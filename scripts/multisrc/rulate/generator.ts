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
    const sourceName = sourceJson.sourceName;
    const iconFileName = sourceName.split('.')[0].toLowerCase() + '.png';
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
import { FilterInputs } from "@libs/filterInputs";
import { NovelStatus } from '@libs/novelStatus';
// import { defaultCover } from "@libs/defaultCover";

export const id = "${pluginId}";
export const name = "${sourceName}";
export const icon = "multisrc/rulate/icons/${iconFileName}";
export const version = "1.0.0";
export const site = "${site}";

export const popularNovels: Plugin.popularNovels = async function (
  page,
  { filters, showLatestNovels }
) {
  let url = site + '/search?t=';
  url += '&cat=' + (filters?.cat || '0');
  url += '&s_lang=' + (filters?.s_lang || '0');
  url += '&t_lang=' + (filters?.t_lang || '0');
  url += '&type=' + (filters?.type || '0');
  url += '&sort=' + (showLatestNovels ? '4' : (filters?.sort || '6'));
  url += '&atmosphere=' + (filters?.atmosphere || '0');
  url += '&adult=' + (filters?.adult || '0');

  if (filters?.genres instanceof Array) {
    url += filters.genres.map(i => '&genres[]=' + i).join('');
  }

  if (filters?.genres_ex instanceof Array) {
    url += filters.genres_ex.map(i => '&genres_ex[]=' + i).join('');
  }

  if (filters?.tags instanceof Array) {
    url += filters.tags.map(i => '&tags[]=' + i).join('');
  }

  if (filters?.tags_ex instanceof Array) {
    url += filters.tags_ex.map(i => '&tags_ex[]=' + i).join('');
  }

  if (filters?.fandoms instanceof Array) {
    url += filters.fandoms.map(i => '&fandoms[]=' + i).join('');
  }

  if (filters?.fandoms_ex instanceof Array) {
    url += filters.fandoms_ex.map(i => '&fandoms_ex[]=' + i).join('');
  }

  if (filters?.trash instanceof Array) {
    url += filters.trash.map(i => '&' + i + '=1').join('');
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
      cover: site + loadedCheerio(this).find('img').attr('src'),
      url: site + loadedCheerio(this).find('p > a').attr('href') || '',
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

      await fetchApi(result.url, {
        method: 'POST',
        body: formData,
      });

      result = await fetchApi(novelUrl);
    }
    const body = await result.text();
    const loadedCheerio = parseHTML(body);

    novel.name = loadedCheerio('div[class="container"] > div > div > h1, div.span8:nth-child(1) > h1:nth-child(2)')
      .text()
      .trim();
    novel.cover =
      site + loadedCheerio('div[class="images"] > div img').attr('src');
    novel.summary = loadedCheerio('#Info > div:nth-child(3), .book-description').text();
    novel.author = loadedCheerio('.book-stats-icons_author > span:nth-child(2) > a:nth-child(1)').text()
    let genres: string[] = [];

    loadedCheerio('div.span5 > p, .span5 > div:nth-child(2) > p').each(function () {
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
      const chapterUrl = site + loadedCheerio(this)
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

    await fetchApi(result.url, {
    method: 'POST',
    body: formData,
    });

    result = await fetchApi(chapterUrl);
  }
  const body = await result.text();
  const loadedCheerio = parseHTML(body);

  loadedCheerio('.content-text img').each(function () {
    if (!loadedCheerio(this).attr('src')?.startsWith('http')) {
      const src = loadedCheerio(this).attr('src');
      loadedCheerio(this).attr('src', site + src);
    }
  });

  const chapterText = loadedCheerio('.content-text').html();
  return chapterText;
};

export const searchNovels: Plugin.searchNovels = async (searchTerm) => {
  const novels: Novel.Item[] = [];
  const result = await fetchApi(
    site + '/search/autocomplete?query=' + searchTerm,
    );
    let json = await result.json() as response[];

    json.forEach((item) => {
    const novelName = item.title_one + ' / ' + item.title_two;
    const novelCover = site + item.img;
    const novelUrl = site + item.url;

    novels.push({ name: novelName, cover: novelCover, url: novelUrl });
    });

  return novels;
};

interface response {
  id: number;
  title_one: string;
  title_two: string;
  url: string;
  img: string;
};

export const fetchImage: Plugin.fetchImage = fetchFile;

export const filters = ${filetersString};`

  return {
    lang: "Russian",
    filename: sourceName,
    pluginScript,
  };
};
