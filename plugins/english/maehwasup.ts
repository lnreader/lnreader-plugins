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

type Post = { URL: string; title: string; date: string };
type Index = { found: number; posts: Post[] };

class Maehwasup implements Plugin.PluginBase {
  id = 'maehwasup';
  name = 'Maehwasup';
  site = 'https://maehwasup.com';
  icon = 'src/en/maehwasup/icon.png';
  version = '1.0.1';

  private async request(url: string) {
    const response = await fetchApi(url);
    if (!response.ok)
      throw Object.assign(new Error(`Maehwasup: HTTP ${response.status}.`), {
        status: response.status,
      });
    return response;
  }

  async popularNovels(page: number): Promise<Plugin.NovelItem[]> {
    if (page !== 1) return [];
    const $ = load(await (await this.request(this.site)).text());
    const name = $('.wp-block-site-title').first().text().trim();
    if (!name) throw new Error('Maehwasup: the novel title could not be read.');
    return [{ name, path: '/', cover: defaultCover }];
  }

  private async index(page: number): Promise<Index> {
    const url =
      'https://public-api.wordpress.com/rest/v1.1/sites/maehwasup.com/posts/' +
      `?number=100&page=${page}&order=ASC&order_by=date&fields=URL,title,date`;
    const data: Index = await (await this.request(url)).json();
    if (
      !Number.isInteger(data.found) ||
      data.found < 0 ||
      !Array.isArray(data.posts)
    )
      throw new Error('Maehwasup: the public chapter index could not be read.');
    return data;
  }

  async parseNovel(path: string): Promise<Plugin.SourceNovel> {
    const novel = (await this.popularNovels(1))[0];
    const first = await this.index(1);
    const pages = Math.ceil(first.found / 100);
    if (pages > 100)
      throw new Error('Maehwasup: the index is unexpectedly large.');
    const chapters: Plugin.ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    let received = 0;
    for (let page = 1; page <= pages; page++) {
      const data = page === 1 ? first : await this.index(page);
      if (data.found !== first.found || !data.posts.length)
        throw new Error(
          'Maehwasup: the index changed. Refresh the novel to retry.',
        );
      received += data.posts.length;
      for (const post of data.posts) {
        const name = load(post.title).text().trim();
        if (!/chapter|side story|spinoff|prologue|epilogue/i.test(name))
          continue;
        const url = new URL(post.URL);
        if (url.origin !== this.site || seen[url.pathname])
          throw new Error(
            'Maehwasup: an invalid or repeated chapter was returned.',
          );
        seen[url.pathname] = true;
        const number = /^Chapter\s+(\d+(?:\.\d+)?)/i.exec(name);
        chapters.push({
          name,
          path: url.pathname,
          releaseTime: post.date,
          chapterNumber: number ? Number(number[1]) : undefined,
        });
      }
    }
    if (received !== first.found || !chapters.length)
      throw new Error(
        'Maehwasup: the chapter list is incomplete. Refresh to retry.',
      );
    return { ...novel, path, chapters };
  }

  async parseChapter(path: string): Promise<string> {
    const $ = load(await (await this.request(this.resolveUrl(path))).text());
    const body = $('.entry-content.wp-block-post-content').first();
    body.find('script,style,iframe,.wordads-tag,.sharedaddy,form').remove();
    body.find('p').each((_, element) => {
      if (
        /^(Please,?\s+subscribe\/donate|ROTMHS Glossary)/i.test(
          $(element).text().trim(),
        )
      )
        $(element).remove();
    });
    const chapter = sanitizeChapter(body.html() || '', this.resolveUrl(path));
    if (load(chapter).text().trim().length < 200)
      throw new Error('Maehwasup: no readable public chapter was found.');
    return chapter;
  }

  async searchNovels(term: string, page: number): Promise<Plugin.NovelItem[]> {
    return (await this.popularNovels(page)).filter(novel =>
      novel.name.toLowerCase().includes(term.trim().toLowerCase()),
    );
  }

  resolveUrl(path: string): string {
    const url = new URL(path, this.site);
    if (url.origin !== this.site)
      throw new Error('Maehwasup: invalid page address.');
    return url.href;
  }
}

export default new Maehwasup();
