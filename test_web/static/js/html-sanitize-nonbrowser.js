// This is an un-browserified version of the script! If you make any changes to this file you need to run
// npx browserify html-sanitize-nonbrowser.js -o html-sanitize.js
// for your changes to be visible inside of the browser!
const sanitizeHtml = require('sanitize-html');

/** @typedef {{removeExtraParagraphSpacing?: boolean}} Options */

const loadingGif =
  'https://raw.githubusercontent.com/LNReader/lnreader/plugins/android/app/src/main/assets/images/loading.gif';

/**
 *
 * @param {string} html
 * @param {Options?} options
 */
window.sanitizeChapterText = (html, options) => {
  if (html) {
    html = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  let text = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'i',
      'em',
      'b',
      'a',
      'div',
    ]),
    allowedAttributes: {
      img: ['src'],
      a: ['href'],
    },
    allowedSchemes: ['data', 'http', 'https', 'file'],
  });
  if (text) {
    if (options?.removeExtraParagraphSpacing) {
      text = text.replace(/<\s*br[^>]*>/gi, '\n').replace(/\n{2,}/g, '\n\n');
    }
    const imgHandlerRegex = /<img([^>]*src="[^"]+"[^>]*)>/g;
    const ttsHandlerRegex =
      /(< *\w+ *>[^<.?!]+< *\/\w+ *>|< *a *href *= *"[^"]+" *>\s*(<img[^>]+>|[^<]+|(< *\w+ *>[^]+< *\/\w+ *>)*)\s*< *\/a *>|< *img[^>]+>|[^<>.?!]+[.?!])/g;
    // first -> match whole tags which dont have attribute and [.?!] inside
    // second -> match a tags and its childs
    // third -> match img tags
    // match sentence split by [.?!]

    text = text
      .replace(
        imgHandlerRegex,
        `<img alt="Plugin can't fetch this img" onload="reader.refresh()" onerror="this.setAttribute('error-src', this.src);reader.post({type:'error-img',data:this.src});this.src='${loadingGif}';this.onerror=undefined" $1>`,
      )
      .replace(ttsHandlerRegex, '<t-t-s>$1</t-t-s>');
  } else {
    text = 'HTML is empty';
  }
  return text;
};
