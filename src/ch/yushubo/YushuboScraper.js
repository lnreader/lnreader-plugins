const cheerio = require("cheerio");
const fetch = require("node-fetch");
const UserAgent = require("user-agents");

const userAgent = new UserAgent();

const baseUrl = "https://m.yushubo.com";

const novelsScraper = async (req, res) => {
  const url = `${baseUrl}/all/order/hits_week+desc.html`;

  const result = await fetch(url, { headers: { "User-Agent": userAgent } });
  const body = await result.text();

  $ = cheerio.load(body);

  let novels = [];

  $(".clearfix > li").each(function (result) {
    const novelUrl =
      $(this).find("a").attr("href").replace(".html", "").substring(1) + "/";

    const novelName = $(this).find("a").text();
    const novelCover = $(this).find("img").attr("src");

    const novel = {
      extensionId: 50,
      novelUrl,
      novelName,
      novelCover,
    };

    novels.push(novel);
  });

  res.json(novels);
};

const novelScraper = async (req, res) => {
  const novelUrl = req.params.novelUrl;
  const url = `${baseUrl}/${novelUrl}.html`;

  const result = await fetch(url, { headers: { "User-Agent": userAgent } });
  const body = await result.text();

  $ = cheerio.load(body);

  let novel = {};

  novel.extensionId = 50;

  novel.sourceName = "Yushubo";

  novel.sourceUrl = url;

  novel.novelUrl = novelUrl + "/";

  novel.novelName = $("dd > h2").text();

  novel.novelCover = $("dt > img").attr("src");

  novel.novelSummary = $("div.content > p").text();

  let info = [];
  $(".info a").each(function (result) {
    info.push($(this).text());
  });

  novel["Author(s)"] = info[0];

  novel["Genre(s)"] = info[1];

  novel["Artist(s)"] = null;

  novel.Status = "Unknown";

  let chapters = [];

  $(".bookshelf-list a").each(function (result) {
    let chapterUrl = $(this).attr("href").substring(1);
    let chapterName = $(this).attr("title");
    let releaseDate = null;

    chapters.push({
      chapterName,
      releaseDate,
      chapterUrl,
    });
  });

  novel.novelChapters = chapters;

  res.json(novel);
};

const chapterScraper = async (req, res) => {
  let novelUrl = req.params.novelUrl.replace(".html/", "");
  let chapterUrl = req.params.chapterUrl;

  const url = `${baseUrl}/${chapterUrl}`;

  const result = await fetch(url, { headers: { "User-Agent": userAgent } });
  const body = await result.text();

  $ = cheerio.load(body);

  const chapterName = $(".read-section h3").text();
  const chapterText = $(".read-section p").text();

  let nextChapter = null;
  if ($(".btn-next").attr("href")) {
    nextChapter = $(".btn-prev").attr("href");
  }

  let prevChapter = null;
  if ($(".btn-prev").attr("href")) {
    prevChapter = $(".btn-prev").attr("href");
  }

  const chapter = {
    extensionId: 50,
    novelUrl,
    chapterUrl,
    chapterName,
    chapterText,
    nextChapter,
    prevChapter,
  };

  res.json(chapter);
};

const searchScraper = async (req, res) => {
  const searchTerm = req.query.s;
  const searchUrl = `${baseUrl}/search.html`;

  const result = await fetch(searchUrl, {
    method: "post",
    body: JSON.stringify({ keyword: searchTerm }),
    headers: { "User-Agent": userAgent, "Content-Type": "application/json" },
  });

  const body = await result.text();

  $ = cheerio.load(body);

  let novels = [];

  $(".clearfix > li").each(function (result) {
    let novelUrl =
      $(this).find("a").attr("href").replace(".html", "").substring(1) + "/";

    const novelName = $(this).find("a").text();
    let novelCover = $(this).find("img").attr("src");
    novelCover = novelCover.startsWith("https://tva1.sinaimg.cn/")
      ? `${novelCover}`
      : `${baseUrl}${novelCover}`;

    const novel = {
      extensionId: 50,
      novelUrl,
      novelName,
      novelCover,
    };

    novels.push(novel);
  });

  res.json(novels);
};

module.exports = YushuboScraper = {
  novelsScraper,
  novelScraper,
  chapterScraper,
  searchScraper,
};
