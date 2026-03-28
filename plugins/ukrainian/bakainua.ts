import { CheerioAPI, load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

class BakaInUa implements Plugin.PluginBase {
  id = 'bakainua';
  name = 'BakaInUA';
  icon = 'src/uk/bakainua/icon.png';
  site = 'https://baka.in.ua';
  version = '3.1.6';

  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const fictionIds: string[] = [];
    const url = new URL(this.site + '/fictions/alphabetical');

    if (pageNo > 1) url.searchParams.append('page', pageNo.toString());
    if (showLatestNovels || (filters && filters.only_new.value))
      url.searchParams.append('only_new', '1');
    if (filters) {
      if (filters.longreads.value) url.searchParams.append('longreads', '1');
      if (filters.finished.value) url.searchParams.append('finished', '1');
      if (filters.genre.value !== '')
        url.searchParams.append('genre', filters.genre.value);
    }

    const result = await fetchApi(url.toString(), {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });

    const body = await result.text();
    const $ = parseHTML(body);

    $('[data-fiction-picker-id-param]').each((_, elem) => {
      const id = $(elem).attr('data-fiction-picker-id-param');
      if (id) fictionIds.push(id);
    });

    const requests = fictionIds.map(async id => {
      try {
        const res = await fetchApi(`${this.site}/fictions/${id}/details`, {
          headers: { 'user-agent': 'Mozilla/5.0' },
        });
        const detailHtml = await res.text();
        const $d = parseHTML(detailHtml);
        const link = $d('a').first();

        return {
          name: $d('h3').text().trim(),
          path: link.attr('href')?.replace(this.site + '/', '') || '',
          cover: this.site + link.find('img').attr('src'),
        };
      } catch (e) {
        return null;
      }
    });

    const novels = await Promise.all(requests);
    return novels.filter((n): n is Plugin.NovelItem => n !== null);
  }

  async parseNovel(novelUrl: string): Promise<Plugin.SourceNovel> {
    // 1. Спочатку відкриваємо сторінку новели
    const result = await fetchApi(this.site + '/' + novelUrl, {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });

    const body = await result.text();
    const $ = parseHTML(body);

    // 2. Збираємо доступні переклади
    const translators = $('turbo-frame#alternative-tabs form')
      .map((_, form) => {
        const name = $(form).find('button span').first().text().trim();
        const ids = $(form)
          .find('input[name="translator[]"]')
          .map((_, input) => $(input).attr('value') || '')
          .get();
        return { name, ids };
      })
      .get();

    // 3. Вибір перекладу (за замовчуванням перший)
    const selected = translators[0];

    // 4. Будуємо URL з параметрами translator[]
    const url = new URL(this.site + '/' + novelUrl);
    if (selected?.ids?.length) {
      selected.ids.forEach(id => url.searchParams.append('translator[]', id));
    }

    // 5. Завантажуємо сторінку вже з вибраним перекладом
    const translatedRes = await fetchApi(url.toString(), {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });

    const translatedBody = await translatedRes.text();
    const $$ = parseHTML(translatedBody);

    let cover = $$('meta[property="og:image"]').attr('content') || '';
    if (cover && !cover.startsWith('http')) {
      cover = this.site + cover;
    }

    const novel: Plugin.SourceNovel = {
      path: novelUrl,
      name: $$('h1').first().text().trim(),
      author: $$('#fictions-author-search').text().trim() || 'Невідомо',
      artist: $$('#fictions-author-search').text().trim() || 'Невідомо',
      cover,
      summary: $$('div.whitespace-pre-line')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim(),
      genres: $$('div.flex.flex-wrap.gap-2 span')
        .map((_, el) => $$(el).text().trim())
        .get()
        .join(', '),
    };

    // 7. Статус
    const statusText = $$('div.text-sm:contains("Статус")') // Знаходимо підпис "Статус"
      .prev('div.text-2xl') // Беремо попередній div з класом text-2xl
      .text()
      .trim();

    if (statusText.includes('Заверш')) {
      novel.status = NovelStatus.Completed;
    } else if (statusText.includes('Видаєт')) {
      novel.status = NovelStatus.Ongoing;
    } else if (statusText.includes('Покину')) {
      novel.status = NovelStatus.OnHiatus;
    } else {
      novel.status = NovelStatus.Unknown;
    }

    // 8. Глави
    const chapters: Plugin.ChapterItem[] = [];
    $$('li.group a[href*="/chapters/"]').each((_, elem) => {
      const href = $$(elem).attr('href') || '';
      chapters.push({
        name: $$(elem).find('span').eq(1).text().trim() || 'Розділ',
        path: href.replace(this.site + '/', ''),
        chapterNumber:
          parseFloat($$(elem).find('span').eq(0).text().replace(',', '.')) || 0,
        releaseTime: $$(elem).find('span').eq(2).text().trim(),
      });
    });

    novel.chapters = chapters.reverse();

    return novel;
  }

  async parseChapter(chapterUrl: string): Promise<string> {
    const result = await fetchApi(this.site + '/' + chapterUrl, {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });

    const body = await result.text();
    const $ = parseHTML(body);

    // Baka.in.ua використовує ActionText (Trix), текст зазвичай у .trix-content або .prose
    let content = $('.trix-content, .prose, article, #chapter-content').first();

    // Якщо основний селектор порожній, шукаємо прихований текст у data-атрібутах (особливість Hotwire/Turbo)
    if (!content.text().trim()) {
      const hiddenData = $('[data-chapter-content-value]').attr(
        'data-chapter-content-value',
      );
      if (hiddenData) return hiddenData;
    }

    content.find('script, style, button, form, .ads, .social-share').remove();

    let chapterHtml = content.html();

    // Останній шанс: пошук тексту в JSON всередині скриптів через Regex
    if (!chapterHtml || chapterHtml.trim().length < 100) {
      const match = body.match(/"content\\":\\"(.*?)\\"/);
      if (match && match[1]) {
        chapterHtml = match[1]
          .replace(/\\n/g, '<br>')
          .replace(/\\"/g, '"')
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>');
      }
    }

    return (
      chapterHtml ||
      'Контент не знайдено. Можливо, потрібна авторизація на сайті.'
    );
  }

  async searchNovels(searchTerm: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/search?filter=fiction&search[]=${encodeURIComponent(searchTerm)}`;

    const result = await fetchApi(url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });

    const body = await result.text();
    const $ = parseHTML(body);
    const novels: Plugin.NovelItem[] = [];

    $('turbo-frame#fictions-section a[href^="/fictions/"]').each((_, elem) => {
      const link = $(elem);

      const href = link.attr('href') || '';
      if (!href) return;

      // витягуємо id
      const id = href.replace(/^\/fictions\//, '').replace(/^\/+/, '');

      const name = link.find('h3').first().text().trim();

      const img = link.closest('.group').find('img').attr('src');

      novels.push({
        path: `/fictions/${id}`, // гарантуємо правильний формат
        name,
        cover: img ? this.site + img : '',
      });
    });

    return novels;
  }

  filters = {
    genre: {
      type: FilterTypes.Picker,
      label: 'Жанр',
      value: '',
      options: [
        { label: 'Всі жанри', value: '' },
        { label: 'BL', value: '19' },
        { label: 'GL', value: '20' },
        { label: 'Авторське', value: '32' },
        { label: 'Бойовик', value: '2' },
        { label: 'Вуся', value: '16' },
        { label: 'Гарем', value: '5' },
        { label: 'Детектив', value: '22' },
        { label: 'Драма', value: '12' },
        { label: 'Жахи', value: '10' },
        { label: 'Ісекай', value: '13' },
        { label: 'Історичне', value: '15' },
        { label: 'Комедія', value: '11' },
        { label: 'ЛГБТ', value: '3' },
        { label: 'Містика', value: '18' },
        { label: 'Омегаверс', value: '30' },
        { label: 'Повсякденність', value: '17' },
        { label: 'Пригоди', value: '7' },
        { label: 'Психологія', value: '28' },
        { label: 'Романтика', value: '1' },
        { label: 'Спорт', value: '9' },
        { label: 'Сюаньхвань', value: '27' },
        { label: 'Сянься', value: '26' },
        { label: 'Трагедія', value: '24' },
        { label: 'Трилер', value: '21' },
        { label: 'Фантастика', value: '8' },
        { label: 'Фанфік', value: '23' },
        { label: 'Фентезі', value: '4' },
        { label: 'Школа', value: '6' },
      ],
    },
    only_new: { type: FilterTypes.Switch, label: 'Новинки', value: false },
    longreads: { type: FilterTypes.Switch, label: 'Довгочити', value: false },
    finished: { type: FilterTypes.Switch, label: 'Завершене', value: false },
  } satisfies Filters;
}

export default new BakaInUa();
