import { Parser } from 'htmlparser2';
import { fetchFile } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';

class ElloTL implements Plugin.PluginBase {
  id = 'ellotl';
  name = 'ElloTL';
  icon = 'src/en/ellotl/icon.png';
  site = 'https://ellotl.com';
  version = '1.0.0';

  parseNovels(url: string) {
    return fetch(url)
      .then(res => res.text())
      .then(html => {
        let isParsingNovel = false;
        let tempNovel = {} as Plugin.NovelItem;
        const novels: Plugin.NovelItem[] = [];
        const parser = new Parser({
          onopentag(name, attribs) {
            if (attribs['class']?.includes('maindet')) {
              isParsingNovel = true;
            }
            if (isParsingNovel) {
              switch (name) {
                case 'a':
                  tempNovel.path = attribs['href']
                    .replace('https://ellotl.com', '')
                    .trim();
                  break;
                case 'img':
                  tempNovel.name = attribs['title'];
                  tempNovel.cover = attribs['src'];
                  break;
              }
              if (tempNovel.path && tempNovel.name) {
                novels.push(tempNovel);
                tempNovel = {} as Plugin.NovelItem;
                isParsingNovel = false;
              }
            }
          },
        });
        parser.write(html);
        parser.end();
        return novels;
      });
  }

  popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + '/series';
    if (showLatestNovels) {
      link += '/?order=update&page=' + pageNo;
    } else if (filters) {
      const params = new URLSearchParams();
      for (const genre of filters.genres.value) {
        params.append('genre[]', genre);
      }
      for (const type of filters.type.value) {
        params.append('type[]', type);
      }
      params.append('status', filters.status.value);
      params.append('order', filters.sort.value);
      link += '/?' + params.toString() + '&page=' + pageNo;
    } else {
      link += '/?page=' + pageNo;
    }
    return this.parseNovels(link);
  }

  parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    return fetch(this.site + novelPath)
      .then(res => res.text())
      .then(html => {
        function extractChapterNumber(
          data: string,
          tempChapter: Plugin.ChapterItem,
        ) {
          let tempChapterNumber = data.match(/(\d+)$/);
          if (tempChapterNumber !== null) {
            tempChapter.chapterNumber = parseInt(tempChapterNumber[0]);
          }
        }
        const novel: Plugin.SourceNovel = {
          path: novelPath,
          name: '',
          genres: '',
          summary: '',
          author: '',
          status: '',
          chapters: [] as Plugin.ChapterItem[],
        };
        let isParsingGenres = false;
        let isReadingGenre = false;
        let isReadingSummary = false;
        let isParsingInfo = false;
        let isReadingInfo = false;
        let isReadingAuthor = false;
        let isReadingStatus = false;
        let isParsingChapterList = false;
        let isReadingChapter = false;
        let isReadingChapterInfo = 0;
        const chapters: Plugin.ChapterItem[] = [];
        let tempChapter = {} as Plugin.ChapterItem;
        const parser = new Parser({
          onopentag(name, attribs) {
            // name and cover
            if (
              !novel.cover &&
              attribs['class']?.includes('ts-post-image' || 'wp-post-image')
            ) {
              novel.name = attribs['title'];
              novel.cover = attribs['src'];
            } // genres
            else if (attribs['class'] === 'genxed') {
              isParsingGenres = true;
            } else if (isParsingGenres && name === 'a') {
              isReadingGenre = true;
            } // summary
            else if (attribs['class'] === 'entry-content') {
              isReadingSummary = true;
            } // author and status
            else if (attribs['class'] === 'spe') {
              isParsingInfo = true;
            } else if (isParsingInfo && name === 'span') {
              isReadingInfo = true;
            } // chapters
            else if (attribs['class'] === 'eplister eplisterfull') {
              isParsingChapterList = true;
            } else if (isParsingChapterList && name === 'li') {
              isReadingChapter = true;
            } else if (isReadingChapter) {
              if (name === 'a') {
                tempChapter.path = attribs['href']
                  .replace('https://ellotl.com', '')
                  .trim();
              } else if (attribs['class'] === 'epl-num') {
                isReadingChapterInfo = 1;
              } else if (attribs['class'] === 'epl-title') {
                isReadingChapterInfo = 2;
              } else if (attribs['class'] === 'epl-date') {
                isReadingChapterInfo = 3;
              }
            }
          },
          ontext(data) {
            // genres
            if (isParsingGenres) {
              if (isReadingGenre) {
                novel.genres += data + ', ';
              }
            } // summary
            else if (isReadingSummary) {
              novel.summary += data.trim();
            } // author and status
            else if (isParsingInfo) {
              if (isReadingInfo) {
                if (data === 'Author:') {
                  isReadingAuthor = true;
                } else if (data === 'Status:') {
                  isReadingStatus = true;
                } else if (isReadingAuthor) {
                  novel.author += data;
                } else if (isReadingStatus) {
                  novel.status = data;
                }
              }
            } // chapters
            else if (isParsingChapterList) {
              if (isReadingChapter) {
                if (isReadingChapterInfo === 1) {
                  extractChapterNumber(data, tempChapter);
                } else if (isReadingChapterInfo === 2) {
                  tempChapter.name =
                    data
                      .match(
                        RegExp(
                          `^${novel.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(.+)`,
                        ),
                      )?.[1]
                      ?.trim() || data.trim();
                  if (!tempChapter.chapterNumber) {
                    extractChapterNumber(data, tempChapter);
                  }
                } else if (isReadingChapterInfo === 3) {
                  tempChapter.releaseTime = data; //new Date(data).toISOString();
                }
              }
            }
          },
          onclosetag(name) {
            // genres
            if (isParsingGenres) {
              if (isReadingGenre) {
                isReadingGenre = false; // stop reading genre
              } else {
                isParsingGenres = false; // stop parsing genres
                novel.genres = novel.genres?.replace(/,*\s*$/, ''); // remove trailing comma
              }
            } // summary
            else if (isReadingSummary) {
              if (name === 'br') {
                novel.summary += '\n';
              } else if (name === 'div') {
                isReadingSummary = false;
              }
            } // author and status
            else if (isParsingInfo) {
              if (isReadingInfo) {
                if (name === 'span') {
                  isReadingInfo = false;
                  if (isReadingAuthor) {
                    isReadingAuthor = false;
                  } else if (isReadingStatus) {
                    isReadingStatus = false;
                  }
                }
              } else if (name === 'div') {
                isParsingInfo = false;
                novel.author = novel.author?.trim();
                novel.status = novel.status?.trim();
              }
            } // chapters
            else if (isParsingChapterList) {
              if (isReadingChapter) {
                if (isReadingChapterInfo === 1) {
                  isReadingChapterInfo = 0;
                } else if (isReadingChapterInfo === 2) {
                  isReadingChapterInfo = 0;
                } else if (isReadingChapterInfo === 3) {
                  isReadingChapterInfo = 0;
                } else if (name === 'li') {
                  isReadingChapter = false;
                  if (!tempChapter.chapterNumber) tempChapter.chapterNumber = 0;
                  chapters.push(tempChapter);
                  tempChapter = {} as Plugin.ChapterItem;
                }
              } else if (name === 'ul') {
                isParsingChapterList = false;
                novel.chapters = chapters.reverse();
              }
            }
          },
        });
        parser.write(html);
        parser.end();
        switch (novel.status?.trim()) {
          case 'Ongoing':
            novel.status = NovelStatus.Ongoing;
            break;
          case 'Hiatus':
            novel.status = NovelStatus.OnHiatus;
            break;
          case 'Completed':
            novel.status = NovelStatus.Completed;
            break;
          default:
            novel.status = NovelStatus.Unknown;
        }
        return novel;
      });
  }

  parseChapter(chapterPath: string): Promise<string> {
    return fetch(this.site + chapterPath)
      .then(res => res.text())
      .then(html => {
        let isParsingContent = false;
        let chapterContent = '';
        let notContent = false;
        const parser = new Parser({
          onopentag(name, attribs) {
            if (attribs['class']?.includes('epcontent' || 'entry-content')) {
              isParsingContent = true;
              chapterContent += '<' + name;
              for (let attrib in attribs) {
                chapterContent += ` ${attrib}="${attribs[attrib]}"`;
              }
              chapterContent += '>';
            }
            if (
              attribs['class']?.includes(
                'wp-block-buttons' || 'wp-block-spacer' || 'wp-element-button',
              )
            ) {
              notContent = true;
            }
            if (name === 'span' && attribs['class']?.includes('maxbutton')) {
              notContent = true;
            }
            if (isParsingContent && !notContent) {
              chapterContent += '<' + name;
              for (let attrib in attribs) {
                chapterContent += ` ${attrib}="${attribs[attrib]}"`;
              }
              chapterContent += '>';
            }
          },
          ontext(data) {
            if (isParsingContent && !notContent) {
              chapterContent += data;
            }
          },
          onclosetag(name) {
            if (isParsingContent && !notContent) {
              chapterContent += `</${name}>`;
            }
            if (notContent) {
              notContent = false;
            }
            if (isParsingContent && !notContent && name === 'div') {
              isParsingContent = false;
            }
          },
        });
        parser.write(html);
        parser.end();
        return chapterContent.trim();
      });
  }

  searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.site + '/?s=' + searchTerm + '&page=' + pageNo;
    return this.parseNovels(url);
  }

  fetchImage(url: string): Promise<string | undefined> {
    // if your plugin has images, and they won't load
    // this is the function to fiddle with
    return fetchFile(url);
  }

  filters = {
    genres: {
      type: FilterTypes.CheckboxGroup,
      label: 'Genres',
      value: [],
      options: [
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Ecchi', value: 'ecchi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Martial Arts', value: 'martial-arts' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'school-life' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Tragedy', value: 'tragedy' },
      ],
    },
    type: {
      type: FilterTypes.CheckboxGroup,
      label: 'Type',
      value: [],
      options: [
        { label: 'Japanese Web Novel', value: 'japanese-web-novel' },
        { label: 'Korean Web Novel', value: 'korean-web-novel' },
        { label: 'Light Novel (JP)', value: 'light-novel-jp' },
        { label: 'Web Novel', value: 'web-novel' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Status',
      value: '',
      options: [
        { label: 'All', value: '' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Completed', value: 'completed' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sort',
      value: 'popular',
      options: [
        { label: 'Popular', value: 'popular' },
        { label: 'A-Z', value: 'title' },
        { label: 'Z-A', value: 'titlereverse' },
        { label: 'Latest Update', value: 'update' },
        { label: 'Latest Added', value: 'latest' },
        { label: 'Rating', value: 'rating' },
      ],
    },
  } satisfies Filters;
}

export default new ElloTL();
