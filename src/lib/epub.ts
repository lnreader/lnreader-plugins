import JSZip from 'jszip';
import { Plugin } from '@/types/plugin';

export interface EpubOptions {
  title: string;
  author?: string;
  description?: string;
  cover?: string;
  language?: string;
}

export interface ChapterData {
  title: string;
  content: string;
  path: string;
}

function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  html = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    '',
  );

  // Remove style tags but keep inline styles
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Ensure images have proper attributes
  html = html.replace(/<img([^>]*)>/gi, (match, attrs) => {
    if (!attrs.includes('alt=')) {
      return `<img${attrs} alt="">`;
    }
    return match;
  });

  return html;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function fetchCoverImage(coverUrl?: string): Promise<{
  data: ArrayBuffer | null;
  mimeType: string;
  extension: string;
}> {
  if (!coverUrl) {
    return { data: null, mimeType: '', extension: '' };
  }

  try {
    let url = coverUrl;
    if (!coverUrl.startsWith('http://') && !coverUrl.startsWith('https://')) {
      url = coverUrl.startsWith('/') ? coverUrl : '/' + coverUrl;
    }

    const response = await fetch(url);

    if (!response.ok) {
      return { data: null, mimeType: '', extension: '' };
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    let extension = 'jpg';
    if (contentType.includes('png')) extension = 'png';
    else if (contentType.includes('gif')) extension = 'gif';
    else if (contentType.includes('webp')) extension = 'webp';

    if (extension === 'jpg') {
      const urlLower = coverUrl.toLowerCase();
      if (urlLower.includes('.png')) extension = 'png';
      else if (urlLower.includes('.gif')) extension = 'gif';
      else if (urlLower.includes('.webp')) extension = 'webp';
    }

    return {
      data: arrayBuffer,
      mimeType: contentType,
      extension,
    };
  } catch (error) {
    console.error('Error fetching cover image:', error);
    return { data: null, mimeType: '', extension: '' };
  }
}

export async function createEpub(
  chapters: ChapterData[],
  options: EpubOptions,
): Promise<Blob> {
  const zip = new JSZip();
  const uuid = generateUUID();
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const coverImage = await fetchCoverImage(options.cover);
  const hasCover = coverImage.data !== null;

  zip.file('mimetype', 'application/epub+zip');

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  if (hasCover && coverImage.data) {
    zip.file(`OEBPS/cover.${coverImage.extension}`, coverImage.data);
  }

  const manifestItems = [
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml"/>',
  ];

  if (hasCover) {
    manifestItems.push(
      `<item id="cover-image" href="cover.${coverImage.extension}" media-type="${coverImage.mimeType}"/>`,
      '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    );
  }

  manifestItems.push(
    ...chapters.map(
      (_, i) =>
        `<item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    ),
  );

  const spineItems = hasCover
    ? ['<itemref idref="cover"/>', '<itemref idref="nav"/>']
    : ['<itemref idref="nav"/>'];

  spineItems.push(
    ...chapters.map((_, i) => `<itemref idref="chapter${i + 1}"/>`),
  );

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(options.title)}</dc:title>
    ${options.author ? `<dc:creator>${escapeXml(options.author)}</dc:creator>` : ''}
    ${options.description ? `<dc:description>${escapeXml(options.description)}</dc:description>` : ''}
    <dc:language>${options.language || 'en'}</dc:language>
    <dc:date>${now}</dc:date>
    <meta property="dcterms:modified">${now}</meta>
    ${hasCover ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;

  zip.file('OEBPS/content.opf', contentOpf);

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(options.title)}</text>
  </docTitle>
  <navMap>
    ${chapters
      .map(
        (chapter, i) => `
    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${escapeXml(chapter.title)}</text>
      </navLabel>
      <content src="chapter${i + 1}.xhtml"/>
    </navPoint>`,
      )
      .join('')}
  </navMap>
</ncx>`;

  zip.file('OEBPS/toc.ncx', tocNcx);

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Navigation</title>
  <meta charset="UTF-8"/>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${chapters.map((chapter, i) => `<li><a href="chapter${i + 1}.xhtml">${escapeXml(chapter.title)}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;

  zip.file('OEBPS/nav.xhtml', navXhtml);

  if (hasCover) {
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Cover</title>
  <meta charset="UTF-8"/>
  <style type="text/css">
    body { margin: 0; padding: 0; text-align: center; }
    img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <img src="cover.${coverImage.extension}" alt="Cover"/>
</body>
</html>`;
    zip.file('OEBPS/cover.xhtml', coverXhtml);
  }

  chapters.forEach((chapter, i) => {
    const sanitizedContent = sanitizeHtml(chapter.content);
    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapter.title)}</title>
  <meta charset="UTF-8"/>
  <style type="text/css">
    body { font-family: serif; line-height: 1.6; margin: 1em; }
    h1, h2, h3 { margin-top: 1em; margin-bottom: 0.5em; }
    p { margin: 0.5em 0; text-align: justify; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <h1>${escapeXml(chapter.title)}</h1>
  ${sanitizedContent}
</body>
</html>`;

    zip.file(`OEBPS/chapter${i + 1}.xhtml`, chapterXhtml);
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
  });
  return blob;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
