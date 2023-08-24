// import { load as parseHTML } from "cheerio";
// import dayjs from 'dayjs';
import { fetchFile, fetchApi } from "@libs/fetch";
import { Novel, Plugin, Chapter } from "@typings/plugin";
// import { parseMadaraDate } from "@libs/parseMadaraDate";
// import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
// import { showToast } from "@libs/showToast";
// import { Filter, FilterInputs } from "@libs/filterInputs";
// import { NovelStatus } from '@libs/novelStatus';
// import { defaultCover } from "@libs/defaultCover";

export const id = ""; // string and must be unique
export const name = "Source name";
export const icon = ""; // The relative path to the icon without @icons . For example: 'src/vi/hakolightnovel/icon.png'
export const version = "0.0.0"; // xx.xx.xx
export const site = ""; // the link to the site
// export const filters: Filter[] = [];

export const popularNovels: Plugin.popularNovels = async function (
    page,
    { filters, showLatestNovels }
) {
    const novels: Novel.Item[] = [];
    /*
    Do something....
    novel = {
      name: '',
      url: '',      must be absolute
      cover: '',    
    }
    novels.push(novel);
  */
    return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
    async function (novelUrl) {
        const novel: Novel.instance = {
            url: novelUrl,
            chapters: [],
        };

        /**
         * novel.name = '';
         * novel.cover = '';
         * novel.summary = '';
         * novel.author = '';
         * novel.artist = '';
         * novel.status = '';
         * novel.genres = '';   join by commas. For example: 'romcom, action, school'
         */

        /*
    Do something....
    chapter = {
      name: '',     chapter name should contain vol, chap num (eg: vol 1 chap 11.5: abcxyz) - it helps a alot in migation
      url: '',      must be absoulute
      releaseTime: '',
    }
    novel.chapters.push(chapter);
  */

        return novel;
    };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
    // Do something...
    const chapterText = "";
    return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
    const novels: Novel.Item[] = [];
    /*
    Do something....
    const novel = {
      name: '',
      url: '',      must be absolute
      cover: '',    
    }
    novels.push(novel);
  */
    return novels;
};

export const fetchImage: Plugin.fetchImage = async function (url) {
    // Some site cant fetch images normally (maybe need some headers)
    // Must return base64 of image
    return await fetchFile(url, {});
};
