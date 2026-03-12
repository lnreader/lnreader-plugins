import { fetchApi } from "@libs/fetch";
import { Plugin } from "@typings/plugin";
import { NovelStatus } from "@libs/novelStatus";
import * as cheerio from "cheerio";

class NovaPlugin implements Plugin.PluginBase {
    id = 'nova';
    name = 'NOVA';
    icon = 'src/es/nova/icon.png';
    site = 'https://novelasligeras.net';
    version = '1.1.0';
    
    // Regex para parsear títulos de capítulos
    private readonly CHAPTER_REGEX = /(Parte \d+) . (.+?): (.+)/;
    
    // Helper para bypass de imágenes de Cloudflare
    private async bypassCloudflareImages(
        $: cheerio.CheerioAPI,
        $content: cheerio.Cheerio<cheerio.Element>
    ): Promise<string> {
        $content.find('img').each((i, img) => {
            const $img = $(img);
            let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-cfsrc');
            
            if (src) {
                // Si la imagen tiene atributos de Cloudflare, usar la URL directa
                $img.attr('src', src);
                $img.removeAttr('data-src');
                $img.removeAttr('data-cfsrc');
            }
        });
        
        return $content.html() || '';
    }
    
    // Helper para convertir HTML a texto limpio (si es necesario)
    private htmlToText(html: string | null | undefined): string {
        if (!html) return '';
        const $ = cheerio.load(html);
        $('script, style').remove();
        return $.text().trim();
    }
    
    // Método para obtener novelas populares
    async popularNovels(
        pageNo: number,
        options: Plugin.PopularNovelsOptions
    ): Promise<Plugin.NovelItem[]> {
        // Para la primera página, usar la búsqueda AJAX
        if (pageNo === 1) {
            return this.searchNovels('', 1);
        }
        
        // Para páginas siguientes, usar la paginación normal
        const url = `${this.site}/index.php/page/${pageNo}/?post_type=product&orderby=popularity`;
        const body = await fetchApi(url).then(res => res.text());
        const $ = cheerio.load(body);
        
        const novels: Plugin.NovelItem[] = [];
        
        $('.dt-css-grid div.wf-cell').each((i, element) => {
            const $el = $(element);
            const $img = $el.find('img');
            const $link = $el.find('h4.entry-title a');
            
            const path = $link.attr('href')?.replace(this.site, '') || '';
            const name = $link.text().trim();
            const cover = $img.attr('data-src') || $img.attr('data-cfsrc') || $img.attr('src') || '';
            
            if (name && path) {
                novels.push({ name, path, cover });
            }
        });
        
        return novels;
    }
    
    // Método para buscar novelas
    async searchNovels(
        searchTerm: string,
        pageNo: number
    ): Promise<Plugin.NovelItem[]> {
        const novels: Plugin.NovelItem[] = [];
        
        if (pageNo > 1) {
            // Búsqueda paginada normal
            const encodedTerm = encodeURIComponent(searchTerm);
            const url = `${this.site}/index.php/page/${pageNo}/?s=${encodedTerm}&post_type=product&title=1&excerpt=1&content=0&categories=1&attributes=1&tags=1&sku=0&orderby=popularity&ixwps=1`;
            
            const body = await fetchApi(url).then(res => res.text());
            const $ = cheerio.load(body);
            
            $('.dt-css-grid div.wf-cell').each((i, element) => {
                const $el = $(element);
                const $img = $el.find('img');
                const $link = $el.find('h4.entry-title a');
                
                const path = $link.attr('href')?.replace(this.site, '') || '';
                const name = $link.text().trim();
                const cover = $img.attr('data-src') || $img.attr('data-cfsrc') || $img.attr('src') || '';
                
                if (name && path) {
                    novels.push({ name, path, cover });
                }
            });
        } else {
            // Primera página: usar búsqueda AJAX
            const url = `${this.site}/wp-admin/admin-ajax.php?tags=1&sku=&limit=30&category_results=&order=DESC&category_limit=5&order_by=title&product_thumbnails=1&title=1&excerpt=1&content=&categories=1&attributes=1`;
            
            const formData = new FormData();
            formData.append('action', 'product_search');
            formData.append('product-search', '1');
            formData.append('product-query', searchTerm);
            
            const response = await fetchApi(url, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (Array.isArray(data)) {
                data.forEach(novel => {
                    const path = novel.url?.replace(this.site, '') || '';
                    const name = novel.title || '';
                    const cover = novel.thumbnail || '';
                    
                    if (name && path) {
                        novels.push({ name, path, cover });
                    }
                });
            }
        }
        
        return novels;
    }
    
    // Método para obtener detalles de una novela
    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const url = `${this.site}${novelPath}`;
        const body = await fetchApi(url).then(res => res.text());
        const $ = cheerio.load(body);
        
        // Extraer información básica
        const name = $('h1').first().text().trim();
        const $coverImg = $('.woocommerce-product-gallery').find('img').first();
        const cover = $coverImg.attr('src') || $coverImg.attr('data-cfsrc') || $coverImg.attr('data-src') || '';
        
        // Extraer autor, artista
        const author = $('.woocommerce-product-attributes-item--attribute_pa_escritor td')
            .text().trim() || 'Desconocido';
        const artist = $('.woocommerce-product-attributes-item--attribute_pa_ilustrador td')
            .text().trim() || '';
        
        // Extraer resumen
        const summaryHtml = $('.woocommerce-product-details__short-description').html();
        const summary = this.htmlToText(summaryHtml);
        
        // Determinar estado
        const statusText = $('.woocommerce-product-attributes-item--attribute_pa_estado td')
            .text().trim().toLowerCase();
        let status = NovelStatus.Unknown;
        if (statusText.includes('en curso') || statusText.includes('ongoing')) {
            status = NovelStatus.Ongoing;
        } else if (statusText.includes('completado') || statusText.includes('completed')) {
            status = NovelStatus.Completed;
        }
        
        // Extraer capítulos
        const chapters: Plugin.ChapterItem[] = [];
        let chapterIndex = 0;
        
        $('.vc_row div.vc_column-inner > div.wpb_wrapper').each((i, element) => {
            const $el = $(element);
            const volume = $el.find('.dt-fancy-title').first().text().trim();
            
            if (!volume.startsWith('Volumen')) {
                return;
            }
            
            $el.find('.wpb_tab a').each((j, chapterEl) => {
                const $chapter = $(chapterEl);
                const chapterPartName = $chapter.text().trim();
                const chapterPath = $chapter.attr('href')?.replace(this.site, '') || '';
                
                if (!chapterPath) return;
                
                const match = this.CHAPTER_REGEX.exec(chapterPartName);
                let chapterName: string;
                
                if (match) {
                    const [, part, chapter, name] = match;
                    chapterName = `${volume} - ${chapter} - ${part}: ${name}`;
                } else {
                    chapterName = `${volume} - ${chapterPartName}`;
                }
                
                chapters.push({
                    name: chapterName,
                    path: chapterPath,
                    releaseTime: '',
                    chapterNumber: chapterIndex + 1
                });
                
                chapterIndex++;
            });
        });
        
        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name,
            cover,
            summary,
            author,
            artist,
            status,
            chapters
        };
        
        return novel;
    }
    
    // Método para obtener contenido del capítulo
    async parseChapter(chapterPath: string): Promise<string> {
        const url = `${this.site}${chapterPath}`;
        const body = await fetchApi(url).then(res => res.text());
        const $ = cheerio.load(body);
        
        // Determinar el selector correcto basado en el contenido
        let $chapterText: cheerio.Cheerio<cheerio.Element>;
        
        if (body.includes('Nadie entra sin permiso en la Gran Tumba de Nazarick')) {
            $chapterText = $('#content');
        } else {
            $chapterText = $('.wpb_text_column.wpb_content_element > .wpb_wrapper');
        }
        
        // Remover anuncios y elementos no deseados
        $chapterText.find('center').remove();
        
        // Convertir elementos con text-align center a tags <center>
        $chapterText.find('*').each((i, el) => {
            const $el = $(el);
            const style = $el.attr('style') || '';
            if (/text-align:.?center/.test(style)) {
                $el.replaceWith(`<center>${$el.html()}</center>`);
            }
        });
        
        // Aplicar bypass de imágenes de Cloudflare
        let chapterContent = await this.bypassCloudflareImages($, $chapterText);
        
        // Limpiar scripts, estilos y otros elementos innecesarios
        const $clean = cheerio.load(chapterContent);
        $clean('script, style, iframe, .ads, .advertisement').remove();
        
        return $clean.html() || chapterContent;
    }
}

export default new NovaPlugin();
