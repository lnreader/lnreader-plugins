import { Chapter, Novel, Plugin } from "@typings/plugin";
import { fetchApi, fetchFile } from "@libs/fetch";
import { NovelStatus } from "@libs/novelStatus";
import dayjs from "dayjs";

export const id = "smakolykytl";
export const name = "Смаколики";
export const site = "https://smakolykytl.site/";
export const version = "1.0.0";
export const icon = "src/ua/smakolykytl/icon.png";

export const popularNovels: Plugin.popularNovels = async function (
  page,
  { showLatestNovels },
) {
  const url = showLatestNovels
    ? "https://api.smakolykytl.site/api/user/updates"
    : "https://api.smakolykytl.site/api/user/projects";

  const result = await fetchApi(url);
  const json = (await result.json()) as response;

  let novels: Novel.Item[] = [];
  (json?.projects || json?.updates)?.forEach((novel) =>
    novels.push({
      name: novel.title,
      cover: novel.image.url,
      url: site + "titles/" + novel.id,
    }),
  );

  return novels;
};

export const parseNovelAndChapters: Plugin.parseNovelAndChapters =
  async function (novelUrl) {
    const id = novelUrl.split("/").pop();
    const result = await fetchApi(
      "https://api.smakolykytl.site/api/user/projects/" + id,
    );
    const book = (await result.json()) as response;

    let novel: Novel.instance = {
      url: novelUrl,
      name: book?.project?.title,
      cover: book?.project?.image?.url,
      summary: book?.project?.description,
      author: book?.project?.author,
      status: book?.project?.status_translate.includes("Триває")
        ? NovelStatus.Ongoing
        : NovelStatus.Completed,
    };
    let tags = [book?.project?.genres, book?.project?.tags]
      .flat()
      .map((tags) => tags?.title)
      .filter((tags) => tags);

    if (tags.length > 0) {
      novel.genres = tags.join(", ");
    }

    let chapters: Chapter.Item[] = [];
    const res = await fetchApi(
      "https://api.smakolykytl.site/api/user/projects/" + id + "/books",
    );
    const data = (await res.json()) as response;
    data?.books?.forEach((volume) =>
      volume?.chapters?.map((chapter) =>
        chapters.push({
          name: volume.title + " " + chapter.title,
          releaseTime: dayjs(chapter.modifiedAt).format("LLL"),
          url: site + "read/" + chapter.id,
        }),
      ),
    );

    novel.chapters = chapters;
    return novel;
  };

export const parseChapter: Plugin.parseChapter = async function (chapterUrl) {
  const id = chapterUrl.split("/").pop();
  const result = await fetchApi(
    "https://api.smakolykytl.site/api/user/chapters/" + id,
  );
  const json = (await result.json()) as response;
  const chapterRaw: HTML[] = JSON.parse(json?.chapter?.content || "{}");

  const chapterText = jsonToHtml(chapterRaw);
  return chapterText;
};

export const searchNovels: Plugin.searchNovels = async function (searchTerm) {
  const result = await fetchApi(
    "https://api.smakolykytl.site/api/user/projects",
  );
  const json = (await result.json()) as response;
  let novels: Novel.Item[] = [];

  json?.projects
    ?.filter(
      (novel) =>
        novel.title.includes(searchTerm) || String(novel.id) === searchTerm,
    )
    ?.forEach((novel) =>
      novels.push({
        name: novel.title,
        cover: novel.image.url,
        url: site + "titles/" + novel.id,
      }),
    );
  return novels;
};

export const fetchImage: Plugin.fetchImage = fetchFile;

function jsonToHtml(json: HTML[], html: string = "") {
  json.forEach((element) => {
    switch (element.type) {
      case "hardBreak":
        html += "<br>";
        break;
      case "horizontalRule":
        html += "<hr>";
        break;
      case "image":
        if (element.attrs) {
          const attrs = Object.entries(element.attrs)
            .filter((attr) => attr?.[1])
            .map((attr) => `${attr[0]}="${attr[1]}"`);
          html += "<img " + attrs.join("; ") + ">";
        }
        break;
      case "paragraph":
        html +=
          "<p>" + (element.content ? jsonToHtml(element.content) : "<br>") + "</p>";
        break;
      case "text":
        html += element.text;
        break;
      default:
        html += JSON.stringify(element, null, "\t"); //maybe I missed something.
        break;
    }
  });
  return html;
}

interface response {
  projects?: TopLevelProject[];
  updates?: Update[];
  project?: TopLevelProject;
  books?: BookElement[];
  chapter?: TopLevelChapter;
}

interface BookElement {
  id: number;
  rank: number;
  title: string;
  chapters: PurpleChapter[];
}

interface PurpleChapter {
  id: number;
  title: string;
  rank: string;
  modifiedAt: Date;
}

interface TopLevelChapter {
  id: number;
  title: string;
  rank: string;
  content: string;
  modifiedAt: Date;
  book: ChapterBook;
}

interface ChapterBook {
  id: number;
  rank: number;
  title: string;
  chapters: FluffyChapter[];
  project: BookProject;
}

interface FluffyChapter {
  id: number;
  rank: string;
}

interface BookProject {
  id: number;
}

interface TopLevelProject {
  id: number;
  title: string;
  description: string;
  author: string;
  translator: string;
  modifiedAt: Date;
  alternatives: string;
  release: string;
  nation: string;
  status: string;
  status_translate: string;
  image: Image;
  tags?: Genre[];
  genres?: Genre[];
}

interface Genre {
  id: number;
  title: string;
}

interface Image {
  id: number;
  url: string;
  name: string;
}

interface Update {
  id: number;
  title: string;
  author: string;
  translator: string;
  modifiedAt: Date;
  image: Image;
}

interface HTML {
  type: string;
  content?: HTML[];
  attrs?: Attrs;
  text?: string;
}

interface Attrs {
  src: string;
  alt: string | null;
  title: string | null;
}
