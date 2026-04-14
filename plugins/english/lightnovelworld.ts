import { Plugin } from "@typings/plugin";
import { fetchApi } from "@libs/fetch";
import { load as loadCheerio } from "cheerio";

export const id = "lightnovelworld";
export const name = "LightNovelWorld";
export const version = "1.0.0";
export const site = "https://www.lightnovelworld.co";

const baseUrl = site;

export const popularNovels: Plugin.PopularNovelsType = async (page) => {
  const res = await fetchApi(`${baseUrl}/novel-list?page=${page}`);
  const body = await res.text();
  const $ = loadCheerio(body);

  const novels: Plugin.NovelItem[] = [];

  $(".novel-item").each((_, el) => {
    const anchor = $(el).find("a");
    const name = anchor.text().trim();
    const link = anchor.attr("href") || "";
    const cover = $(el).find("img").attr("src") || "";

    novels.push({
      name,
      path: link.replace(baseUrl, ""),
      cover,
    });
  });

  return { novels };
};

export const parseNovel: Plugin.ParseNovelType = async (path) => {
  const res = await fetchApi(baseUrl + path);
  const body = await res.text();
  const $ = loadCheerio(body);

  return {
    name: $("h1").text().trim(),
    cover: $(".novel-cover img").attr("src") || "",
    summary: $(".summary").text().trim(),
  };
};

export const parseChapters: Plugin.ParseChaptersType = async (path) => {
  const res = await fetchApi(baseUrl + path);
  const body = await res.text();
  const $ = loadCheerio(body);

  const chapters: Plugin.ChapterItem[] = [];

  $(".chapter-list a").each((_, el) => {
    chapters.push({
      name: $(el).text().trim(),
      path: ($(el).attr("href") || "").replace(baseUrl, ""),
    });
  });

  return chapters.reverse();
};

export const parseChapter: Plugin.ParseChapterType = async (path) => {
  const res = await fetchApi(baseUrl + path);
  const body = await res.text();
  const $ = loadCheerio(body);

  return {
    content: $(".chapter-content").html() || "",
  };
};

export default {
  id,
  name,
  version,
  site,
  popularNovels,
  parseNovel,
  parseChapters,
  parseChapter,
};
