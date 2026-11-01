import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Checks if a URL is absolute
 */
export const isUrlAbsolute = (url: string) => {
  if (url) {
    if (url.indexOf('//') === 0) {
      return true;
    } // URL is protocol-relative (= absolute)
    if (url.indexOf('://') === -1) {
      return false;
    } // URL has no protocol (= relative)
    if (url.indexOf('.') === -1) {
      return false;
    } // URL does not contain a dot, i.e. no TLD (= relative, possibly REST)
    if (url.indexOf('/') === -1) {
      return false;
    } // URL does not contain a single slash (= relative)
    if (url.indexOf(':') > url.indexOf('/')) {
      return false;
    } // The first colon comes after the first slash (= relative)
    if (url.indexOf('://') < url.indexOf('.')) {
      return true;
    } // Protocol is defined before first dot (= absolute)
  }
  return false; // Anything else must be relative
};

/**
 * Returns a displayable cover URL, routing external URLs through Vite proxy
 */
export const getCoverUrl = (cover?: string | null): string => {
  if (!cover) {
    return '/static/coverNotAvailable.webp';
  }
  if (cover.startsWith('http://') || cover.startsWith('https://')) {
    return `/${cover}`;
  }
  return cover;
};
