$('div.entry-content script').remove();

const url = this.site + chapterPath.slice(0, -1);
const offsets = [
  [0, 12368, 12462],
  [1, 6960, 7054],
  [2, 4176, 4270],
];
const idx = (url.length * url.charCodeAt(url.length - 1) * 2) % 3;
const [_, offsetLower, offsetCap] = offsets[idx] ?? offsets[0];

const asciiA = 'A'.charCodeAt(0);
const asciiz = 'z'.charCodeAt(0);
$('div.entry-content > p').text((_, txt) =>
  txt
    .split('')
    .map(char => {
      const code = char.charCodeAt(0);
      const offset =
        code >= offsetLower + asciiA && code <= offsetLower + asciiz
          ? offsetLower
          : offsetCap;
      const decoded = code - offset;
      return decoded >= 32 && decoded <= 126
        ? String.fromCharCode(decoded)
        : char;
    })
    .join(''),
);
