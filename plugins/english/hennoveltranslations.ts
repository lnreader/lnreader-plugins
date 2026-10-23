import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { defaultCover } from '@libs/defaultCover';
import { load } from 'cheerio';

function sanitizeChapter(html: string, base: string): string {
  const $ = load(html, null, false);
  $(
    'script,style,iframe,object,embed,svg,math,form,template,noscript',
  ).remove();
  const tags =
    'p,div,span,h1,h2,h3,h4,h5,h6,br,hr,strong,em,b,i,u,s,del,small,sub,sup,blockquote,pre,code,ul,ol,li,table,thead,tbody,tfoot,tr,th,td,a,img,ruby,rt,rp'.split(
      ',',
    );
  $('*').each((_, element) => {
    const node = $(element);
    const tag = node.prop('tagName')?.toLowerCase() || '';
    if (!tags.includes(tag)) {
      node.replaceWith(node.contents());
      return;
    }
    const allowed = ['title'];
    if (tag === 'a') allowed.push('href');
    if (tag === 'img') allowed.push('src', 'alt');
    for (const attribute of Object.keys(node.attr() || {})) {
      if (!allowed.includes(attribute)) node.removeAttr(attribute);
    }
    const attribute = tag === 'a' ? 'href' : tag === 'img' ? 'src' : undefined;
    if (attribute && node.attr(attribute)) {
      try {
        const url = new URL(node.attr(attribute)!, base);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
          node.removeAttr(attribute);
        else node.attr(attribute, url.href);
      } catch {
        node.removeAttr(attribute);
      }
    }
  });
  return $.root().html() || '';
}

class HenNovelTranslations implements Plugin.PluginBase {
  id = 'hennoveltranslations';
  name = 'Hen Novel Translations';
  site = 'https://hennoveltranslations.org';
  icon = 'src/en/hennoveltranslations/icon.png';
  version = '1.0.1';

  private async html(path: string) {
    const response = await fetchApi(this.resolveUrl(path));
    if (!response.ok)
      throw Object.assign(
        new Error(`Hen Novel Translations: HTTP ${response.status}.`),
        {
          status: response.status,
        },
      );
    return response.text();
  }

  private async document(path: string) {
    return load(await this.html(path));
  }

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    if (page !== 1) return [];
    const $ = await this.document('/');
    const novels: Plugin.NovelItem[] = [];
    $('.book-item-feature').each((_, element) => {
      const card = $(element);
      const title = card.find('.book-title a');
      const href = title.attr('href');
      if (!href || !title.text().trim()) return;
      const image = card.find('img').first();
      novels.push({
        name: title.text().trim(),
        path: new URL(this.resolveUrl(href)).pathname,
        cover: image.attr('data-src') || image.attr('src') || defaultCover,
      });
    });
    if (!novels.length)
      throw new Error(
        'Hen Novel Translations: the project list could not be read.',
      );
    return novels;
  }

  async parseNovel(path: string): Promise<Plugin.SourceNovel> {
    const html = await this.html(path);
    const $ = load(html);
    const name = $('.single-novel-title h1').text().trim();
    if (!name)
      throw new Error('Hen Novel Translations: the novel could not be read.');
    const details = $('.custom-fields').first();
    const field = (label: string) => {
      const paragraph = details
        .find('p')
        .filter(
          (_, element) =>
            $(element).find('strong').first().text().trim() === label,
        )
        .first()
        .clone();
      paragraph.find('strong').remove();
      return paragraph.text().trim() || undefined;
    };
    const summary = details.clone();
    summary.find('h2,.alternate-chapters,p').remove();
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    // The site's episode-list2 is its FREE CHAPTERS list; list1 is paid advance access.
    const list = $('.episode-list2');
    const completeLists = html.match(
      /<ul\b[^>]*\bclass\s*=\s*(["'])[^"']*\bepisode-list2\b[^"']*\1[^>]*>[\s\S]*?<\/ul\s*>/gi,
    );
    const rows = list.children('li');
    const group = list.closest('.episode-group');
    if (
      list.length !== 1 ||
      completeLists?.length !== 1 ||
      !rows.length ||
      list.find('li').length !== rows.length ||
      list.find('a').length !== rows.length ||
      group.find('.pagination,a[rel=next],.load-more,[data-next-page]').length
    )
      throw new Error(
        'Hen Novel Translations: the free chapter list is incomplete or has changed.',
      );
    const declaredTotal = list.attr('data-total');
    if (declaredTotal !== undefined && Number(declaredTotal) !== rows.length)
      throw new Error(
        'Hen Novel Translations: not all free chapters were returned.',
      );
    rows.each((_, element) => {
      const row = $(element);
      const link = row.find('a[href]');
      if (link.length !== 1 || !link.text().trim())
        throw new Error(
          'Hen Novel Translations: a free chapter link is missing.',
        );
      const url = new URL(this.resolveUrl(link.attr('href')!));
      const postId = url.searchParams.get('p');
      const chapterPath = url.pathname.startsWith('/episodes/')
        ? url.pathname
        : url.pathname === '/' &&
            url.searchParams.get('post_type') === 'episodes' &&
            postId &&
            /^\d+$/.test(postId) &&
            Number.isSafeInteger(Number(postId)) &&
            Number(postId) > 0
          ? `/?post_type=episodes&p=${Number(postId)}`
          : undefined;
      if (!chapterPath || seen[chapterPath])
        throw new Error(
          'Hen Novel Translations: an invalid or repeated free chapter was returned.',
        );
      seen[chapterPath] = true;
      const title = link.text().trim();
      const number = /(?:episode|chapter)\s+(\d+(?:\.\d+)?)/i.exec(title);
      chapters.push({
        name: title,
        path: chapterPath,
        chapterNumber: number ? Number(number[1]) : undefined,
        releaseTime: row.find('time').attr('datetime'),
      });
    });
    chapters.reverse();
    if (chapters.length !== rows.length)
      throw new Error(
        'Hen Novel Translations: the free chapter list is incomplete.',
      );
    return {
      name,
      path,
      cover: $('.novel-content img').first().attr('src') || defaultCover,
      summary: summary.text().trim(),
      author: field('Author:'),
      genres: field('Genre:'),
      status: field('Light Novel Status(Korean):'),
      chapters,
    };
  }

  async parseChapter(path: string): Promise<string> {
    const $ = await this.document(path);
    const body = $('.episode-content').first();
    if (
      body.find('input[type=password]').length ||
      /^(?:This content is|Please log in|You must be logged)/i.test(
        body.text().trim(),
      )
    )
      throw new Error(
        'Hen Novel Translations: this chapter is not publicly readable.',
      );
    body
      .find('script,style,iframe,form,button,.episode-navigation,.adsbygoogle')
      .remove();
    body.find('[style]').removeAttr('style');
    const chapter = sanitizeChapter(body.html() || '', this.resolveUrl(path));
    if (load(chapter).text().trim().length < 200)
      throw new Error(
        'Hen Novel Translations: no readable public chapter was found.',
      );
    return chapter;
  }

  async searchNovels(term: string, page: number): Promise<Plugin.NovelItem[]> {
    const query = term.trim().toLowerCase();
    return (await this.popularNovels(page)).filter(novel =>
      (novel.name + ' ' + novel.path.replace(/-/g, ' '))
        .toLowerCase()
        .includes(query),
    );
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.origin !== this.site)
      throw new Error('Hen Novel Translations: invalid page address.');
    return url.href;
  }
}

export default new HenNovelTranslations();
