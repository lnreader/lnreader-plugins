export const NovelStatus = {
  Unknown: 'Unknown',
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  Licensed: 'Licensed',
  PublishingFinished: 'Publishing Finished',
  Cancelled: 'Cancelled',
  OnHiatus: 'On Hiatus',
  STUB: 'STUB',
  Inactive: 'Inactive',
} as const;

export const PluginError = {
  Captcha: 'Captcha error, please open in webview',
  Cloudflare: 'Cloudflare is blocking requests. Try again later.',
  RateLimited: 'Too many requests (429). Please try again later.',
  NotFound:
    'Content not found (404), it may have been removed from this source.',
  NovelNotFound:
    'Novel not found (404), it may have been removed from this source.',
  ChapterNotFound:
    'Chapter not found (404), it may have been removed from this source.',
  AuthRequired: 'Authentication required. Please log in via WebView.',
  EmptyContent: 'No readable content was found.',
  InvalidResponse: 'Invalid response from source.',
  NetworkError: 'Could not reach site, please try to open in webview.',
} as const;
