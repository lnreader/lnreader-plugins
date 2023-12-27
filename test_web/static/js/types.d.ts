interface Window {
    themes: Record<string, ThemeType>;
    sanitizeChapterText(html: string, options?: Options);
}
