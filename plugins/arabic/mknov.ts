import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';

type MKWork = {
  id: number;
  slug: string;
  title: string;
  titleAr: string;
  author?: string | null;
  translator?: string | null;
  status?: string | null;
  year?: number | null;
  totalViews?: number;
  totalChapters?: number;
  genres?: string[];
  description?: string;
  image?: string;
};

type MKChapter = {
  id: number;
  chapterNumber: number;
  chapterTitle: string;
  publishDate?: string;
  views?: number;
};

type MKVolume = {
  volumeNumber: number;
  title: string;
  chapters: MKChapter[];
};

type MKWorkListResponse = MKWork[]; // /api/works returns an array directly

/**
 * Substitution maps extracted from each `protected-font-N.woff2`
 * version that the site rotates through. The chapter RSC content is
 * encrypted by mapping each real Arabic letter to a sibling, then
 * displayed through a @font-face whose glyph cmap holds the cipher.
 * The page tells us which font (and therefore which cipher) applies via
 * the `protected-font-N` name in the chapter HTML.
 *
 * Each map: raw codepoint in the RSC text -> real Arabic letter.
 * The site also rotates long dashes `―` per map, omitted here.
 */
const FONT_CMAPS: Record<number, Record<string, string>> = {
  1: {
    'آ': 'د',
    'أ': 'إ',
    'ؤ': 'ر',
    'إ': 'ا',
    'ئ': 'غ',
    'ا': 'أ',
    'ب': 'ن',
    'ة': 'ز',
    'ت': 'ض',
    'ث': 'ت',
    'ج': 'ث',
    'ح': 'ع',
    'خ': 'ب',
    'د': 'ة',
    'ذ': 'آ',
    'ر': 'ذ',
    'ز': 'و',
    'س': 'ك',
    'ش': 'ف',
    'ص': 'م',
    'ض': 'ظ',
    'ط': 'س',
    'ظ': 'ق',
    'ع': 'ح',
    'غ': 'ئ',
    'ف': 'ش',
    'ق': 'ي',
    'ك': 'ص',
    'ل': 'ط',
    'م': 'ه',
    'ن': 'ج',
    'ه': 'ل',
    'و': 'ؤ',
    'ي': 'خ',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  2: {
    'آ': 'أ',
    'أ': 'ا',
    'ؤ': 'و',
    'إ': 'ز',
    'ئ': 'ق',
    'ا': 'ؤ',
    'ب': 'غ',
    'ة': 'ذ',
    'ت': 'ئ',
    'ث': 'ظ',
    'ج': 'ب',
    'ح': 'ه',
    'خ': 'ج',
    'د': 'آ',
    'ذ': 'ة',
    'ر': 'إ',
    'ز': 'د',
    'س': 'م',
    'ش': 'ض',
    'ص': 'س',
    'ض': 'ت',
    'ط': 'ح',
    'ظ': 'ف',
    'ع': 'ط',
    'غ': 'خ',
    'ف': 'ي',
    'ق': 'ن',
    'ك': 'ص',
    'ل': 'ع',
    'م': 'ل',
    'ن': 'ش',
    'ه': 'ك',
    'و': 'ر',
    'ي': 'ث',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  3: {
    'آ': 'ز',
    'أ': 'ؤ',
    'ؤ': 'و',
    'إ': 'ة',
    'ئ': 'غ',
    'ا': 'أ',
    'ب': 'ج',
    'ة': 'إ',
    'ت': 'ش',
    'ث': 'ض',
    'ج': 'ق',
    'ح': 'م',
    'خ': 'ئ',
    'د': 'ر',
    'ذ': 'د',
    'ر': 'ا',
    'ز': 'آ',
    'س': 'ه',
    'ش': 'ظ',
    'ص': 'ل',
    'ض': 'خ',
    'ط': 'س',
    'ظ': 'ي',
    'ع': 'ص',
    'غ': 'ن',
    'ف': 'ب',
    'ق': 'ث',
    'ك': 'ع',
    'ل': 'ح',
    'م': 'ط',
    'ن': 'ت',
    'ه': 'ك',
    'و': 'ذ',
    'ي': 'ف',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  4: {
    'آ': 'ذ',
    'أ': 'ة',
    'ؤ': 'أ',
    'إ': 'ر',
    'ئ': 'غ',
    'ا': 'د',
    'ب': 'ش',
    'ة': 'آ',
    'ت': 'ف',
    'ث': 'ض',
    'ج': 'ي',
    'ح': 'ك',
    'خ': 'ج',
    'د': 'و',
    'ذ': 'ز',
    'ر': 'ؤ',
    'ز': 'إ',
    'س': 'ه',
    'ش': 'خ',
    'ص': 'ح',
    'ض': 'ب',
    'ط': 'ل',
    'ظ': 'ن',
    'ع': 'ص',
    'غ': 'ق',
    'ف': 'ت',
    'ق': 'ئ',
    'ك': 'ع',
    'ل': 'س',
    'م': 'ط',
    'ن': 'ظ',
    'ه': 'م',
    'و': 'ا',
    'ي': 'ث',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  5: {
    'آ': 'و',
    'أ': 'ا',
    'ؤ': 'ر',
    'إ': 'ذ',
    'ئ': 'خ',
    'ا': 'د',
    'ب': 'ج',
    'ة': 'إ',
    'ت': 'ث',
    'ث': 'ظ',
    'ج': 'غ',
    'ح': 'ع',
    'خ': 'ش',
    'د': 'ز',
    'ذ': 'آ',
    'ر': 'ؤ',
    'ز': 'ة',
    'س': 'م',
    'ش': 'ت',
    'ص': 'ه',
    'ض': 'ئ',
    'ط': 'ص',
    'ظ': 'ق',
    'ع': 'ط',
    'غ': 'ي',
    'ف': 'ن',
    'ق': 'ض',
    'ك': 'ل',
    'ل': 'ح',
    'م': 'س',
    'ن': 'ب',
    'ه': 'ك',
    'و': 'أ',
    'ي': 'ف',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  6: {
    'آ': 'ؤ',
    'أ': 'ة',
    'ؤ': 'ا',
    'إ': 'آ',
    'ئ': 'خ',
    'ا': 'ز',
    'ب': 'ج',
    'ة': 'أ',
    'ت': 'ب',
    'ث': 'ف',
    'ج': 'ض',
    'ح': 'ط',
    'خ': 'ش',
    'د': 'و',
    'ذ': 'د',
    'ر': 'ذ',
    'ز': 'إ',
    'س': 'ح',
    'ش': 'ق',
    'ص': 'ك',
    'ض': 'ي',
    'ط': 'ص',
    'ظ': 'ئ',
    'ع': 'ه',
    'غ': 'ن',
    'ف': 'ث',
    'ق': 'ظ',
    'ك': 'ل',
    'ل': 'س',
    'م': 'ع',
    'ن': 'ت',
    'ه': 'م',
    'و': 'ر',
    'ي': 'غ',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  7: {
    'آ': 'د',
    'أ': 'ة',
    'ؤ': 'إ',
    'إ': 'ذ',
    'ئ': 'ف',
    'ا': 'ر',
    'ب': 'ي',
    'ة': 'ز',
    'ت': 'ض',
    'ث': 'ج',
    'ج': 'ظ',
    'ح': 'ع',
    'خ': 'ش',
    'د': 'أ',
    'ذ': 'و',
    'ر': 'آ',
    'ز': 'ؤ',
    'س': 'ك',
    'ش': 'ق',
    'ص': 'ح',
    'ض': 'ت',
    'ط': 'ص',
    'ظ': 'غ',
    'ع': 'ل',
    'غ': 'خ',
    'ف': 'ن',
    'ق': 'ب',
    'ك': 'م',
    'ل': 'ط',
    'م': 'ه',
    'ن': 'ث',
    'ه': 'س',
    'و': 'ا',
    'ي': 'ئ',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  8: {
    'آ': 'ا',
    'أ': 'د',
    'ؤ': 'ذ',
    'إ': 'ز',
    'ئ': 'ي',
    'ا': 'إ',
    'ب': 'ش',
    'ة': 'ؤ',
    'ت': 'ث',
    'ث': 'ت',
    'ج': 'ف',
    'ح': 'س',
    'خ': 'ئ',
    'د': 'و',
    'ذ': 'أ',
    'ر': 'ة',
    'ز': 'ر',
    'س': 'ع',
    'ش': 'ق',
    'ص': 'م',
    'ض': 'ظ',
    'ط': 'ل',
    'ظ': 'ب',
    'ع': 'ه',
    'غ': 'ن',
    'ف': 'غ',
    'ق': 'ض',
    'ك': 'ص',
    'ل': 'ط',
    'م': 'ك',
    'ن': 'ج',
    'ه': 'ح',
    'و': 'آ',
    'ي': 'خ',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  9: {
    'آ': 'ؤ',
    'أ': 'د',
    'ؤ': 'و',
    'إ': 'ة',
    'ئ': 'غ',
    'ا': 'ذ',
    'ب': 'ت',
    'ة': 'إ',
    'ت': 'ن',
    'ث': 'ش',
    'ج': 'ث',
    'ح': 'ك',
    'خ': 'ي',
    'د': 'ز',
    'ذ': 'آ',
    'ر': 'أ',
    'ز': 'ا',
    'س': 'م',
    'ش': 'ق',
    'ص': 'س',
    'ض': 'ئ',
    'ط': 'ع',
    'ظ': 'ج',
    'ع': 'ل',
    'غ': 'خ',
    'ف': 'ب',
    'ق': 'ف',
    'ك': 'ه',
    'ل': 'ص',
    'م': 'ح',
    'ن': 'ظ',
    'ه': 'ط',
    'و': 'ر',
    'ي': 'ض',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  10: {
    'آ': 'د',
    'أ': 'آ',
    'ؤ': 'ز',
    'إ': 'ذ',
    'ئ': 'ش',
    'ا': 'ة',
    'ب': 'ف',
    'ة': 'إ',
    'ت': 'ض',
    'ث': 'ج',
    'ج': 'ئ',
    'ح': 'ع',
    'خ': 'ث',
    'د': 'و',
    'ذ': 'ؤ',
    'ر': 'أ',
    'ز': 'ا',
    'س': 'ح',
    'ش': 'ظ',
    'ص': 'م',
    'ض': 'ن',
    'ط': 'ك',
    'ظ': 'ب',
    'ع': 'ط',
    'غ': 'ت',
    'ف': 'خ',
    'ق': 'غ',
    'ك': 'ل',
    'ل': 'ه',
    'م': 'ص',
    'ن': 'ي',
    'ه': 'س',
    'و': 'ر',
    'ي': 'ق',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  11: {
    'آ': 'و',
    'أ': 'ؤ',
    'ؤ': 'ر',
    'إ': 'ز',
    'ئ': 'ف',
    'ا': 'د',
    'ب': 'ج',
    'ة': 'إ',
    'ت': 'ي',
    'ث': 'ق',
    'ج': 'غ',
    'ح': 'ص',
    'خ': 'ن',
    'د': 'آ',
    'ذ': 'ا',
    'ر': 'أ',
    'ز': 'ة',
    'س': 'ح',
    'ش': 'خ',
    'ص': 'ك',
    'ض': 'ت',
    'ط': 'ه',
    'ظ': 'ب',
    'ع': 'ل',
    'غ': 'ض',
    'ف': 'ظ',
    'ق': 'ش',
    'ك': 'م',
    'ل': 'ط',
    'م': 'س',
    'ن': 'ئ',
    'ه': 'ع',
    'و': 'ذ',
    'ي': 'ث',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  12: {
    'آ': 'إ',
    'أ': 'ا',
    'ؤ': 'أ',
    'إ': 'ر',
    'ئ': 'ن',
    'ا': 'آ',
    'ب': 'ض',
    'ة': 'ذ',
    'ت': 'غ',
    'ث': 'ش',
    'ج': 'ق',
    'ح': 'ص',
    'خ': 'ي',
    'د': 'ة',
    'ذ': 'و',
    'ر': 'ز',
    'ز': 'ؤ',
    'س': 'م',
    'ش': 'خ',
    'ص': 'ه',
    'ض': 'ئ',
    'ط': 'ك',
    'ظ': 'ب',
    'ع': 'ل',
    'غ': 'ف',
    'ف': 'ظ',
    'ق': 'ث',
    'ك': 'ح',
    'ل': 'ط',
    'م': 'ع',
    'ن': 'ج',
    'ه': 'س',
    'و': 'د',
    'ي': 'ت',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  13: {
    'آ': 'ر',
    'أ': 'ؤ',
    'ؤ': 'ذ',
    'إ': 'ة',
    'ئ': 'ث',
    'ا': 'آ',
    'ب': 'ئ',
    'ة': 'إ',
    'ت': 'ب',
    'ث': 'ق',
    'ج': 'ش',
    'ح': 'ص',
    'خ': 'ي',
    'د': 'و',
    'ذ': 'د',
    'ر': 'أ',
    'ز': 'ا',
    'س': 'ه',
    'ش': 'ف',
    'ص': 'ع',
    'ض': 'ن',
    'ط': 'ك',
    'ظ': 'ج',
    'ع': 'ط',
    'غ': 'ض',
    'ف': 'ظ',
    'ق': 'ت',
    'ك': 'س',
    'ل': 'م',
    'م': 'ح',
    'ن': 'غ',
    'ه': 'ل',
    'و': 'ز',
    'ي': 'خ',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  14: {
    'آ': 'أ',
    'أ': 'ة',
    'ؤ': 'ر',
    'إ': 'ذ',
    'ئ': 'ي',
    'ا': 'إ',
    'ب': 'ش',
    'ة': 'ا',
    'ت': 'ئ',
    'ث': 'ق',
    'ج': 'ن',
    'ح': 'م',
    'خ': 'ظ',
    'د': 'و',
    'ذ': 'آ',
    'ر': 'ؤ',
    'ز': 'د',
    'س': 'ح',
    'ش': 'ض',
    'ص': 'س',
    'ض': 'ب',
    'ط': 'ص',
    'ظ': 'غ',
    'ع': 'ط',
    'غ': 'ث',
    'ف': 'ج',
    'ق': 'ف',
    'ك': 'ه',
    'ل': 'ك',
    'م': 'ع',
    'ن': 'ت',
    'ه': 'ل',
    'و': 'ز',
    'ي': 'خ',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  15: {
    'آ': 'ز',
    'أ': 'ذ',
    'ؤ': 'د',
    'إ': 'ا',
    'ئ': 'ش',
    'ا': 'إ',
    'ب': 'ت',
    'ة': 'و',
    'ت': 'ظ',
    'ث': 'ق',
    'ج': 'ي',
    'ح': 'ه',
    'خ': 'ئ',
    'د': 'أ',
    'ذ': 'ة',
    'ر': 'ؤ',
    'ز': 'ر',
    'س': 'ع',
    'ش': 'ب',
    'ص': 'ك',
    'ض': 'ث',
    'ط': 'ل',
    'ظ': 'ف',
    'ع': 'م',
    'غ': 'ن',
    'ف': 'غ',
    'ق': 'خ',
    'ك': 'ط',
    'ل': 'ح',
    'م': 'س',
    'ن': 'ج',
    'ه': 'ص',
    'و': 'آ',
    'ي': 'ض',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  16: {
    'آ': 'و',
    'أ': 'ؤ',
    'ؤ': 'ر',
    'إ': 'آ',
    'ئ': 'ت',
    'ا': 'ة',
    'ب': 'غ',
    'ة': 'د',
    'ت': 'ث',
    'ث': 'ظ',
    'ج': 'خ',
    'ح': 'ط',
    'خ': 'ش',
    'د': 'ذ',
    'ذ': 'ز',
    'ر': 'أ',
    'ز': 'إ',
    'س': 'ص',
    'ش': 'ن',
    'ص': 'ك',
    'ض': 'ق',
    'ط': 'ل',
    'ظ': 'ئ',
    'ع': 'ه',
    'غ': 'ج',
    'ف': 'ي',
    'ق': 'ض',
    'ك': 'م',
    'ل': 'س',
    'م': 'ع',
    'ن': 'ف',
    'ه': 'ح',
    'و': 'ا',
    'ي': 'ب',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  17: {
    'آ': 'إ',
    'أ': 'ة',
    'ؤ': 'و',
    'إ': 'آ',
    'ئ': 'ب',
    'ا': 'ؤ',
    'ب': 'ق',
    'ة': 'ز',
    'ت': 'غ',
    'ث': 'ش',
    'ج': 'ث',
    'ح': 'ه',
    'خ': 'ن',
    'د': 'ر',
    'ذ': 'د',
    'ر': 'أ',
    'ز': 'ا',
    'س': 'ك',
    'ش': 'ف',
    'ص': 'ط',
    'ض': 'ي',
    'ط': 'م',
    'ظ': 'ئ',
    'ع': 'س',
    'غ': 'ظ',
    'ف': 'ت',
    'ق': 'خ',
    'ك': 'ل',
    'ل': 'ع',
    'م': 'ص',
    'ن': 'ض',
    'ه': 'ح',
    'و': 'ذ',
    'ي': 'ج',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  18: {
    'آ': 'ا',
    'أ': 'ذ',
    'ؤ': 'آ',
    'إ': 'ر',
    'ئ': 'ض',
    'ا': 'ؤ',
    'ب': 'خ',
    'ة': 'إ',
    'ت': 'ف',
    'ث': 'ئ',
    'ج': 'ظ',
    'ح': 'م',
    'خ': 'ش',
    'د': 'أ',
    'ذ': 'ز',
    'ر': 'و',
    'ز': 'د',
    'س': 'ح',
    'ش': 'ي',
    'ص': 'ط',
    'ض': 'ب',
    'ط': 'ع',
    'ظ': 'ن',
    'ع': 'ه',
    'غ': 'ث',
    'ف': 'ق',
    'ق': 'ج',
    'ك': 'ص',
    'ل': 'س',
    'م': 'ك',
    'ن': 'غ',
    'ه': 'ل',
    'و': 'ة',
    'ي': 'ت',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
  19: {
    'آ': 'ذ',
    'أ': 'ؤ',
    'ؤ': 'ة',
    'إ': 'ا',
    'ئ': 'خ',
    'ا': 'ز',
    'ب': 'ت',
    'ة': 'د',
    'ت': 'ش',
    'ث': 'ن',
    'ج': 'ب',
    'ح': 'ع',
    'خ': 'ي',
    'د': 'ر',
    'ذ': 'و',
    'ر': 'أ',
    'ز': 'آ',
    'س': 'ل',
    'ش': 'ق',
    'ص': 'ك',
    'ض': 'ظ',
    'ط': 'س',
    'ظ': 'ض',
    'ع': 'ه',
    'غ': 'ث',
    'ف': 'غ',
    'ق': 'ج',
    'ك': 'م',
    'ل': 'ح',
    'م': 'ص',
    'ن': 'ئ',
    'ه': 'ط',
    'و': 'إ',
    'ي': 'ف',
    '۱': '١',
    '۳': '٣',
    '۸': '٨',
    '۹': '٩',
  },
};

/** Pick the cipher matching the font version found on the page. */
function pickCmap(fontVersion: number): Record<string, string> {
  return FONT_CMAPS[fontVersion] ?? FONT_CMAPS[14];
}

/** Decode a raw T-record payload with the given cipher. */
function decodeChapter(content: string, cmap: Record<string, string>): string {
  return (
    // Array.from() rather than `[...content]` — TypeScript downlevels the
    // spread to a helper that requires a real array and breaks on strings.
    Array.from(content)
      .map(ch => cmap[ch] ?? ch)
      .join('')
      // CJK / Hangul / Katakana & other scripts the font renders as nothing
      .replace(/[぀-ヿ一-鿿가-힯ㇰ-ㇿ㈀-䶿豈-﫿]/g, '')
      // Zero-width, format & bidi controls
      .replace(/[\u200B-\u200F\u2060-\u2063\u202A-\u202E\u061C\uFEFF]/g, '')
      // Arabic diacritics (harakat, sukun, superscript alef) are noise here,
      // listed individually so ESLint's no-misleading-character-class stays quiet
      .replace(/[\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0670]/g, '')
  );
}

class MKNOV implements Plugin.PluginBase {
  id = 'mknov';
  name = 'مملكه الروايات';
  version = '1.0.0';
  icon = 'src/ar/mknov/icon.png';
  site = 'https://mknov.com';

  private baseUrl = 'https://mknov.com';
  private allWorksCache: MKWork[] | null = null;
  private readonly maxOffset = 2000;

  /** Fetch JSON from an endpoint. */
  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
    }
    return res.json() as Promise<T>;
  }

  /** Fetch raw text. */
  private async fetchText(url: string): Promise<string> {
    const res = await fetchApi(url);
    if (!res.ok) {
      throw new Error(`Could not reach site (${res.status})`);
    }
    return res.text();
  }

  /** /api/works returns a `MKWork[]` array (all works) directly. */
  private async fetchAllWorks(): Promise<MKWork[]> {
    if (this.allWorksCache) {
      return this.allWorksCache;
    }
    const works = await this.fetchJson<MKWorkListResponse>(
      `${this.baseUrl}/api/works?limit=${this.maxOffset}`,
    );
    this.allWorksCache = works || [];
    return this.allWorksCache;
  }

  /** Return only the fields we're sure the site provides. */
  private toNovelItem(work: MKWork): Plugin.NovelItem {
    return {
      name: work.titleAr || work.title || `رواية ${work.id}`,
      path: `/novel/${work.id}`,
      cover: work.image || '',
    };
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const limit = 50;
    const offset = (pageNo - 1) * limit;

    // Fetching more than the site allows would fail; keep pagination naive.
    if (offset >= this.maxOffset) {
      return [];
    }

    const works = await this.fetchJson<MKWorkListResponse>(
      `${this.baseUrl}/api/works?offset=${offset}&limit=${limit}`,
    );

    return (works || []).map(work => this.toNovelItem(work));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const id = novelPath.replace('/novel/', '').replace(/\/$/, '');
    const works = await this.fetchAllWorks();
    const work = works.find(w => String(w.id) === id);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: work?.titleAr || work?.title || '',
      cover: work?.image || '',
      author: work?.author || undefined,
      summary: work?.description || '',
      genres: (work?.genres || []).join(', '),
      status: (work?.status || '').toLowerCase().includes('مستمر')
        ? NovelStatus.Ongoing
        : (work?.status || '').toLowerCase().includes('مكتمل')
          ? NovelStatus.Completed
          : NovelStatus.Unknown,
    };

    // Fetch chapter list
    const data = await this.fetchJson<{ volumes?: MKVolume[] }>(
      `${this.baseUrl}/api/works/${id}/chapters`,
    );

    const chapters: Plugin.ChapterItem[] = [];
    const volumes = data.volumes || [];

    for (const volume of volumes) {
      for (const ch of volume.chapters || []) {
        chapters.push({
          name: ch.chapterTitle || `الفصل ${ch.chapterNumber}`,
          path: `/novel/${id}/chapter/${ch.id}`,
          releaseTime: ch.publishDate || '',
          chapterNumber: ch.chapterNumber,
        });
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.baseUrl}${chapterPath}`;
    const html = await this.fetchText(url);

    // Extract all RSC flight chunks (self.__next_f.push([1, "..."]))
    const allChunks: string[] = [];
    const textRe =
      /self\.__next_f\.push\(\[\s*1\s*,\s*("(?:[^"\\]|\\.)*")\s*\]/g;
    let match;
    while ((match = textRe.exec(html)) !== null) {
      try {
        allChunks.push(JSON.parse(match[1]));
      } catch {
        // skip unparseable chunks
      }
    }

    const fullPayload = allChunks.join('');

    // Chapter content is streamed as a Next.js Flight T-record:
    //   <ref>:T<hlen>,<text>
    const tRe = /([0-9a-f]+):T([0-9a-f]+),/g;
    let content = '';
    while ((match = tRe.exec(fullPayload)) !== null) {
      const hlen = parseInt(match[2], 16);
      const start = match.index + match[0].length;
      content += fullPayload.slice(start, start + hlen);
    }

    // If no T-record, try a raw "content"-style paragraph block in the payload
    if (!content.trim()) {
      const contentIdx = fullPayload.indexOf('"content":');
      if (contentIdx > -1) {
        const pStart = fullPayload.indexOf('"', contentIdx + 9);
        if (pStart > -1) {
          let depth = 0;
          let inStr = false;
          for (let i = pStart + 1; i < fullPayload.length; i++) {
            const ch = fullPayload[i];
            if (ch === '\\') {
              i++;
              continue;
            }
            if (inStr) {
              if (ch === '"') inStr = false;
              continue;
            }
            if (ch === '{') depth++;
            else if (ch === '}') {
              depth--;
              if (depth === 0) {
                content = fullPayload.slice(pStart + 1, i);
                break;
              }
            }
          }
        }
      }
    }

    if (!content.trim()) {
      return '<p>المحتوى غير متاح.</p>';
    }

    // The running protected-font version drives which cipher applies.
    let fontVer = 0;
    const fontMatch = html.match(/protected-font-(\d+)/);
    if (fontMatch) {
      fontVer = parseInt(fontMatch[1], 10);
    }
    const cmap = pickCmap(fontVer);

    // Decode the font-cmap obfuscation, then drop any leftover noise.
    const cleaned = decodeChapter(content, cmap);
    const readable = cleaned.replace(/[^؀-ۿݐ-ݿ\s،.;?!…0-9"'()\-–—:«»]/g, '');

    // Wrap paragraphs
    return readable
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const works = await this.fetchAllWorks();
    const term = searchTerm.trim().toLowerCase();

    const filtered = works.filter(
      w =>
        w.titleAr?.toLowerCase().includes(term) ||
        w.title?.toLowerCase().includes(term) ||
        w.author?.toLowerCase().includes(term),
    );

    return filtered.map(w => this.toNovelItem(w));
  }

  resolveUrl = (path: string): string => this.site + path;
}

export default new MKNOV();
