import { fetchApi, fetchFile } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { Filters } from "@libs/filterInputs";
import { load as parseHTML } from "cheerio";

class NovelFrance implements Plugin.PluginBase {
  id = "novelfrance.fr";
  name = "NovelFrance";
  icon = "src/fr/novelfrance/icon.png";
  site = "https://novelfrance.fr";
  version = "1.0.0";
  filters: Filters | undefined = undefined;

  async popularNovels(
    page: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const sort = showLatestNovels ? "newest" : "popular";
    const url = `${this.site}/browse?sort=${sort}&page=${page}`;
    const body = await fetchApi(url).then((res) => res.text());
    const $ = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    $("a[href*='/novel/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!href.includes("/novel/") || href.includes("/chapter")) return;

      const name =
        $(el).find("h2, h3, [class*='title'], .name").first().text().trim() ||
        $(el).find("img").attr("alt")?.trim() ||
        $(el).attr("aria-label")?.trim() ||
        "";

      if (!name) return;

      const cover =
        $(el).find("img").attr("src") ||
        $(el).find("img").attr("data-src") ||
        "";

      const path = href.startsWith("http")
        ? href.replace(this.site, "")
        : href;

      novels.push({ name, cover, path });
    });

    // Dédoublonnage par path
    const seen = new Set<string>();
    return novels.filter((n) => {
      if (seen.has(n.path)) return false;
      seen.add(n.path);
      return true;
    });
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then((r) => r.text());
    const $ = parseHTML(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: "",
    };

    // Titre
    novel.name =
      $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content")?.trim() ||
      "";

    // Couverture
    novel.cover =
      $("meta[property='og:image']").attr("content") ||
      $(".novel-cover img, .cover img, [class*='cover'] img").first().attr("src") ||
      "";

    // Résumé
    novel.summary =
      $("[class*='description'], [class*='synopsis'], .summary")
        .first()
        .text()
        .trim() ||
      $("meta[name='description']").attr("content") ||
      "";

    // Auteur
    novel.author = $("[class*='author'] a, [class*='author'] span")
      .first()
      .text()
      .trim();

    // Statut
    const statusText = $("[class*='status']").first().text().toLowerCase();
    if (statusText.includes("complet") || statusText.includes("terminé")) {
      novel.status = "Completed";
    } else if (statusText.includes("en cours") || statusText.includes("ongoing")) {
      novel.status = "Ongoing";
    } else if (statusText.includes("pausé") || statusText.includes("hiatus")) {
      novel.status = "Hiatus";
    }

    // Genres
    novel.genres = $("[class*='genre'] a, [class*='tag'] a, .tags a")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(", ");

    // Chapitres
    const chapters: Plugin.ChapterItem[] = [];

    $("a[href*='/chapter-'], a[href*='/chapitre-']").each((i, el) => {
      const href = $(el).attr("href") || "";
      if (!href) return;

      const path = href.startsWith("http") ? href.replace(this.site, "") : href;

      const name =
        $(el).text().trim() ||
        `Chapitre ${i + 1}`;

      const numMatch = href.match(/chapter-(\d+(?:\.\d+)?)/i) ||
        href.match(/chapitre-(\d+(?:\.\d+)?)/i);
      const chapterNumber = numMatch ? parseFloat(numMatch[1]) : i + 1;

      const releaseTime =
        $(el).closest("li, [class*='chapter']")
          .find("time, [class*='date']")
          .attr("datetime") ||
        $(el).closest("li, [class*='chapter']")
          .find("time, [class*='date']")
          .text()
          .trim() ||
        "";

      chapters.push({ name, path, releaseTime, chapterNumber });
    });

    // Tri croissant
    chapters.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const body = await fetchApi(this.site + chapterPath).then((r) => r.text());
    const $ = parseHTML(body);

    // Sélecteurs courants pour le contenu
    const selectors = [
      ".chapter-content",
      "#chapter-content",
      "[class*='chapter-body']",
      "[class*='chapter-text']",
      ".prose",
      "article .prose",
      "article",
    ];

    let content = "";
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length) {
        // Supprimer les éléments parasites
        el.find("script, style, nav, header, footer, aside, [class*='ad'], [class*='banner'], [class*='comment']").remove();
        content = el.html() || "";
        break;
      }
    }

    return content || "<p>Contenu introuvable.</p>";
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/browse?search=${encodeURIComponent(searchTerm)}&page=${page}`;
    const body = await fetchApi(url).then((res) => res.text());
    const $ = parseHTML(body);

    const novels: Plugin.NovelItem[] = [];

    $("a[href*='/novel/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!href.includes("/novel/") || href.includes("/chapter")) return;

      const name =
        $(el).find("h2, h3, [class*='title'], .name").first().text().trim() ||
        $(el).find("img").attr("alt")?.trim() ||
        "";

      if (!name) return;

      const cover =
        $(el).find("img").attr("src") ||
        $(el).find("img").attr("data-src") ||
        "";

      const path = href.startsWith("http")
        ? href.replace(this.site, "")
        : href;

      novels.push({ name, cover, path });
    });

    const seen = new Set<string>();
    return novels.filter((n) => {
      if (seen.has(n.path)) return false;
      seen.add(n.path);
      return true;
    });
  }

  async fetchImage(url: string): Promise<string | undefined> {
    return fetchFile(url);
  }
}

export default new NovelFrance();
