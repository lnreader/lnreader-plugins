interface Window {
  themes: Record<string, ThemeType>;
  sanitizeChapterText(html: string, options?: Options);
  encodeHTML5(html: string, options?: Options);
}
