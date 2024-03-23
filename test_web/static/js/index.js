// @ts-check
/* Imports */
/** @typedef {import("@libs/filterInputs").Filters} Filters */
/** @typedef {import("@typings/types").PluginList} PluginList */
/** @typedef {import("@typings/plugin").Plugin.PluginItem} PluginItem */
/** @typedef {import("@typings/plugin").Plugin.ChapterItem} ChapterItem */
/** @typedef {import("@typings/plugin").Plugin.NovelItem} NovelItem */
/** @typedef {import("@typings/plugin").Plugin.SourceNovel & {totalPages?: number}} SourceNovel */
/** @typedef {import("@typings/plugin").Plugin.SourcePage} SourcePage */
/** @typedef {import("@libs/filterInputs").FilterTypes} FilterTypes */
/** @typedef {import("@libs/filterInputs").FilterTypes.CheckboxGroup} CheckboxGroup */
/**
 * @template {FilterTypes} T
 * @typedef {import("@libs/filterInputs").ValueOfFilter<T>} ValueOfFilter<T> */
/**
 * @template {Filters} T
 * @typedef {import("@libs/filterInputs").FilterToValues<T>} FilterToValues<T>
 */
/** @typedef {{backgroundColor:string, textColor:string}} Theme */
/** @typedef {Theme[]} Themes */
/** @typedef {import("./accordion").AccordionBox} AccordionBox */
/// <reference path="./types.d.ts" />

// #region DOM Queries
const nav = $('nav');

/** @type {JQuery<AccordionBox>} */
const headerChanger = $('#headerChanger');

/** @type {JQuery<AccordionBox>} */
const popularNovels = $('#popularNovels');
/** @type {JQuery<HTMLDivElement>} */
const popularNovels_page_select = $('#popularNovels .page-select');
/** @type {JQuery<HTMLDivElement>} */
const popularNovels_fetch_btn = $('#popularNovels .fetch-btn');
/** @type {JQuery<HTMLDivElement>} */
const popularNovels_spinner = $('#popularNovels .spinner-border');
/** @type {JQuery<HTMLDivElement>} */
const popularNovels_novel_list = $('#popularNovels .novel-list');

/** @type {JQuery<AccordionBox>} */
const searchNovels = $('#searchNovels');
/** @type {JQuery<HTMLDivElement>} */
const seacrhNovels_novel_list = $('#searchNovels .novel-list');
/** @type {JQuery<HTMLDivElement>} */
const searchNovels_page_select = $('#searchNovels .page-select');
/** @type {JQuery<HTMLDivElement>} */
const searchNovels_fetch_btn = $('#searchNovels .fetch-btn');
/** @type {JQuery<HTMLInputElement>} */
const searchNovels_searchbar = $('#searchNovels .searchbar input');

/** @type {JQuery<AccordionBox>} */
const parseNovel = $('#parseNovel');
/** @type {JQuery<AccordionBox>} */
const parsePage = $('#parsePage');
/** @type {JQuery<AccordionBox>} */
const parseChapter = $('#parseChapter');

/** @type {JQuery<AccordionBox>} */
const fetchImage = $('#fetchImage');
/** @type {JQuery<AccordionBox>} */
const resolveUrl = $('#resolveUrl');

/** @type {JQuery<HTMLSelectElement>}*/
const plugin_language_selection = $('#language');
/** @type {JQuery<HTMLInputElement>} */
const plugin_search = $('#plugin');
/** @type {JQuery<HTMLDivElement>} */
const plugin_search_results = $('#search-results');
/** @type {JQuery<HTMLButtonElement>} */
const clear_plugin_search = $('#clear-search');

/** @type {JQuery<HTMLInputElement>} */
const previewSwitch = $('#raw-preview-switch');
/** @type {JQuery<HTMLDivElement>} */
const chapterViewer = $('#chapter-viewer');
/** @type {JQuery<HTMLDivElement>} */
const filtersModal = $('#filtersModal .modal-body');
/** @type {JQuery<HTMLInputElement>} */
const latestSwitch = $('#latest-switch');

// #endregion

// #region pagination
class NovelListPagination {
  constructor(
    /** @type {boolean} */ sL,
    /** @type {JQuery<HTMLDivElement>} */ sE,
    /** @type {JQuery<HTMLDivElement>} */ fC,
    /** @type {JQuery<HTMLDivElement>} */ nL,
  ) {
    /** @type {Record<number,NovelItem[]>} */
    this.pageStore = {};
    this._showlatest = sL;
    this.lastFetchedPage = 0;
    this.currentPage = 0;
    this.canFetchMore = true;
    this.selectElement = sE;
    this.fetchContainer = fC;
    this.resetStoreOnFetch = true;
    this.novelList = nL;
  }
  get showLatest() {
    return this._showlatest;
  }
  set showLatest(val) {
    this._showlatest = val;
    this.reset();
  }
  get fetchBtn() {
    return this.fetchContainer.children('button')[0];
  }
  get numSelect() {
    return this.selectElement.children('select')[0];
  }
  lockFetch(cause = 0) {
    this.canFetchMore = false;
    this.fetchBtn.disabled = true;
    if (cause === 1) this.fetchBtn.innerText = 'no more to fetch';
    if (cause === 2) this.fetchBtn.innerText = 'fetching';
    if (cause === 3) this.fetchBtn.innerText = 'error';
  }
  unlockFetch() {
    this.canFetchMore = true;
    this.fetchBtn.disabled = false;
    this.fetchBtn.innerText = 'fetch';
  }
  async fetchNovels(
    /** @type {(page:number, latest: boolean)=>Promise<NovelItem[]>} */ fn,
  ) {
    this.error = undefined;
    if (this.resetStoreOnFetch) {
      this.resetStoreOnFetch = false;
      this.pageStore = {};
    }
    try {
      this.lockFetch(2);
      const lfp = ++this.lastFetchedPage;
      console.log('fetching ', lfp, 'page');
      const novels = await fn(lfp, this.showLatest);
      if (novels.length === 0) {
        this.lastFetchedPage--;
        this.lockFetch(1);
        if (this.lastFetchedPage === 0) {
          this.error = 'No novels found!';
          this.render();
        }
        return false;
      }
      this.loadNovels(lfp, novels);
      this.unlockFetch();
      return true;
    } catch (e) {
      this.lastFetchedPage--;
      this.lockFetch(3);
      this.error = `${e}`;
      this.render();
      return false;
    }
  }
  showNextPage() {
    console.log('lf', this.lastFetchedPage, 'cp', this.currentPage);
    if (this.lastFetchedPage > this.currentPage) {
      this.currentPage = this.lastFetchedPage;
      this.render();
    }
    this.numSelect.value = `${this.currentPage}`;
  }
  arePagesTheSame(
    /** @type {NovelItem[]} */ p1,
    /** @type {NovelItem[]} */ p2,
  ) {
    if (p1.length !== p2.length) return false;
    let i = 0;
    for (const novel of p1) {
      if (novel.path !== p2[i].path) return false;
      i++;
    }
    return true;
  }
  loadNovels(/** @type {number} */ page, /** @type {NovelItem[]} */ list) {
    this.pageStore[page] = list;
    if (page - 1 > 0 && this.pageStore[page - 1]) {
      if (
        this.arePagesTheSame(this.pageStore[page], this.pageStore[page - 1])
      ) {
        if (this.numSelect.nextElementSibling)
          this.numSelect.nextElementSibling.innerHTML =
            "Pages are the same! It's possible that pagination is not implemented in the source!";
      }
    }
  }
  reset() {
    this.hideSelectBox();
    this.currentPage = 0;
    this.lastFetchedPage = 0;
    this.resetStoreOnFetch = true;
    this.error = undefined;
    if (this.numSelect.nextElementSibling) {
      this.numSelect.nextElementSibling.innerHTML = '';
    }
    this.unlockFetch();
  }
  setupSelectBox() {
    this.selectElement[0].style.display = 'inline';
    this.numSelect.innerHTML = '';
    for (let i = 1; i <= this.lastFetchedPage; i++) {
      const option = $('<option>').text(`${i}`).val(`${i}`);
      this.numSelect.append(option[0]);
    }
    this.numSelect.value = `${this.currentPage}`;
    this.numSelect.onchange = () => {
      this.currentPage = parseInt(this.numSelect.value);
      this.render();
    };
  }
  hideSelectBox() {
    this.selectElement[0].style.display = '';
  }
  render() {
    if (this.lastFetchedPage > 1) {
      if (!this.pageStore[this.currentPage]) {
        console.log('no page store, erroring');
        this.reset();
        this.error =
          'Please request new pages after previous one loaded! Try again!';
      }
    }
    if (this.error) {
      this.novelList.html('');
      this.novelList.append(this.error);
      return;
    }
    if (this.lastFetchedPage > 0) {
      this.setupSelectBox();
      this.fetchBtn.innerText = 'fetch next';
    }
    this.novelList.html('');
    this.novelList.append(
      ...this.pageStore[this.currentPage].map(novel =>
        PluginWrapper.createNovelItem(novel, {
          target: popularNovels[0],
        }),
      ),
    );
  }
}
// #endregion

// #region state
const state = {
  /** @type {PluginList} */
  all_plugins: {},
  /** @type {Array<PluginItem>} */
  plugin_infos: [],
  /** @type {{language: string, keyword:null|string}} */
  plugin_search: {
    language: '',
    keyword: null,
  },
  /** @type {Array<PluginItem>} */
  plugins_in_search: [],
  /** @type {PluginWrapper | undefined} */
  current_plugin: undefined,
  /** @type {FilterToValues<Filters>} */
  filterValues: {},
  /** popularNovels pagination states */
  popular_pages: new NovelListPagination(
    false,
    popularNovels_page_select,
    popularNovels_fetch_btn,
    popularNovels_novel_list,
  ),
  search_pages: new NovelListPagination(
    false,
    searchNovels_page_select,
    searchNovels_fetch_btn,
    seacrhNovels_novel_list,
  ),
};
// #endregion

// #region util functions
/**
 *
 * @param {string} path
 * @param {RequestInit | undefined} init
 */
const fetchFromAPI = async (path, init = undefined) => {
  if (init) {
    init.headers = {
      ...init.headers,
      'x-custom-headers': JSON.stringify(getHeaders()),
    };
  }
  return fetch(path, init);
};
// #endregion

class PluginWrapper {
  /**
   * @param {string} requirePath
   */
  constructor(requirePath) {
    /** @type {string} */
    parsePage.addClass('d-none');
    this.requirePath = requirePath;
    this.currentView = previewSwitch?.[0]?.checked ? 'preview' : 'raw';
    fetchFromAPI('/hasParsePage/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pluginRequirePath: this.requirePath,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.hasParsePage) {
          parsePage.removeClass('d-none');
        }
      });
  }

  static previewSettings = {
    htmlTemplate: '',
    fillJS: '',
    fillCSS: '',
    customJS: '',
    customCSS: '',
    readerSettings: {
      theme: '#292832',
      textColor: '#CCCCCC',
      textSize: 16,
      textAlign: 'left',
      padding: 5,
      fontFamily: '',
      lineHeight: 1.5,
    },
    iframeSize: {
      width: 800,
      height: 1200,
    },
    /** @type {Theme} */
    theme: window.themes[window.themes.length - 2],
    layoutHeight: 0,
    novel: { pluginId: 0 },
    chapter: { novelId: 0, id: 0 },
    html: '',
    sanitizedHTML: '',
    sanitize: true,
    StatusBar: { currentHeight: 0 },
  };

  /** @type {"raw" | "preview"} */
  currentView = 'raw';

  /** @type {NodeJS.Timeout[]} */
  static clocks = [];

  /**
   * @param {[string,Filters[string]]} flt
   * @returns {JQuery<HTMLDivElement>}
   */
  static createFilterElement(flt) {
    /** @param {string} f */
    const getSafeFilterID = f => f.replace(/\s/g, '_').toLowerCase();
    /** @type {JQuery<HTMLDivElement>} */
    const retDiv = $('<div>');
    const [key, filter] = flt;
    retDiv.addClass(`${filter.type}Filter`);
    switch (filter.type) {
      case 'Picker':
        {
          const id = `${key}_picker`;
          // add label
          $('<span>')
            .addClass('filter-label')
            .text(`${filter.label}:`)
            .appendTo(retDiv);

          /** @type {JQuery<HTMLSelectElement>} */
          const select = $('<select>');
          // add select and its attributes
          select
            .attr('title', `key: ${key}`)
            .addClass('custom-select')
            .on('change', e => {
              state.popular_pages.reset();
              state.filterValues[key].value = e.target.selectedOptions[0].value;
            })
            .appendTo(retDiv);
          // add all the options
          for (const option of filter.options) {
            select.append(
              `<option ${
                option.value === filter.value ? 'selected' : ''
              } value='${option.value}'>${option.label}</option>`,
            );
          }
        }
        break;
      case 'Checkbox':
        {
          // add label
          $('<span>')
            .addClass('filter-label')
            .text(filter.label)
            .appendTo(retDiv);

          // create box for checkboxes
          const box = $('<div>').appendTo(retDiv).addClass('checkbox-groupbox');

          // add all checkboxes
          for (let cb of filter.options) {
            const id = `checkbox_${key}_${getSafeFilterID(cb.value)}`;
            /** @type {JQuery<HTMLInputElement>} */
            let inp = $('<input>', { type: 'checkbox' });
            // set default value
            inp[0].checked = filter.value.includes(cb.value);
            // set checkbox attributes and listeners
            inp.attr('id', id).on('change', e => {
              const { checked } = e.target;
              state.popular_pages.reset();
              const fV = state.filterValues[key];
              if (Array.isArray(fV.value)) {
                fV.value = checked
                  ? [...fV.value, cb.value]
                  : fV.value.filter(r => r !== cb.value);
              }
            });
            // add checkbox label
            const label = $('<label>', { for: id })
              .text(cb.label)
              .prepend(inp)
              .attr('title', `${key}: ${cb.value}`);
            $('<div>').append(label).appendTo(box);
          }
        }
        break;
      case 'Switch': {
        const id = `switch_${key}`;
        // add the checkbox
        const slider_checkbox = $('<div>');
        slider_checkbox.addClass('slider-checkbox');
        const label = $('<label>');
        /** @type {JQuery<HTMLInputElement>} */
        const checkbox = $('<input>', { type: 'checkbox' });
        checkbox.attr('id', id);
        // set default value
        checkbox[0].checked = filter.value;
        label
          .append(checkbox, $('<span>').text(filter.label))
          .appendTo(slider_checkbox);
        slider_checkbox.appendTo(retDiv);
        break;
      }
      case 'Text':
        {
          const id = `text_${key}`;
          $('<label>', { for: id })
            .text(filter.label)
            .addClass('filter-label')
            .appendTo(retDiv);
          /** @type {JQuery<HTMLInputElement>} */
          const inp = $('<input>', { type: 'text' });
          inp
            .attr('id', id)
            .on('change', e => {
              state.popular_pages.reset();
              const fV = state.filterValues[key];
              if (typeof fV.value === 'string') {
                fV.value = e.target.value;
              }
            })
            .appendTo(retDiv);
          // set default value
          inp.val(filter.value);
        }
        break;
      case 'XCheckbox':
        {
          // add label
          $('<span>')
            .addClass('filter-label')
            .text(filter.label)
            .appendTo(retDiv);

          // create box for checkboxes
          const box = $('<div>')
            .appendTo(retDiv)
            .addClass('xcheckbox-groupbox');

          // add all checkboxes
          for (let cb of filter.options) {
            const id = `checkbox_${key}_${getSafeFilterID(cb.value)}`;

            const getCurrentState = () => {
              const fV = state.filterValues[key];
              if (typeof fV.value === 'object' && !Array.isArray(fV.value)) {
                return (
                  (fV.value.exclude?.includes(cb.value) && 'x') ||
                  (fV.value.include?.includes(cb.value) && 'i') ||
                  false
                );
              }
              return false;
            };

            // default State
            const checkedState =
              (filter.value.exclude?.includes(cb.value) && 'x') ||
              (filter.value.include?.includes(cb.value) && 'i') ||
              false;

            /** @type {JQuery<HTMLLabelElement>} */
            const label = $('<label>', { for: id });
            label.addClass('xcheckbox').attr('data-state', checkedState || '');
            /** @type {JQuery<HTMLInputElement>} */
            const xchb = $('<input>', { type: 'checkbox' });
            if (checkedState) xchb[0].checked = true;
            xchb.attr('id', id);
            label.text(cb.label).append(xchb).append($('<span>'));
            xchb.on('change', e => {
              state.popular_pages.reset();
              e.preventDefault();
              e.stopImmediatePropagation();
              e.stopPropagation();
              const fV = state.filterValues[key];
              if (fV.value instanceof Array || typeof fV.value !== 'object')
                return;
              const curState = getCurrentState();
              switch (curState) {
                case 'i':
                  if (fV.value.include)
                    fV.value.include = fV.value.include.filter(
                      f => f !== cb.value,
                    );
                  if (fV.value.exclude) fV.value.exclude.push(cb.value);
                  else fV.value.exclude = [cb.value];
                  e.target.checked = true;
                  label[0].dataset.state = 'x';
                  break;
                case 'x':
                  // set to false
                  if (fV.value.exclude)
                    fV.value.exclude = fV.value.exclude.filter(
                      f => f !== cb.value,
                    );
                  e.target.checked = false;
                  label[0].dataset.state = '';
                  break;
                default:
                  // set to "e"
                  if (!fV.value.include) fV.value.include = [cb.value];
                  else fV.value.include.push(cb.value);
                  e.target.checked = true;
                  label[0].dataset.state = 'i';
                  break;
              }
            });
            box.append(label);
          }
        }
        break;
      default:
        return retDiv;
    }
    return retDiv;
  }

  async getFilters() {
    try {
      /** @type {Filters} */
      const filters = await (
        await fetchFromAPI('/filters', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pluginRequirePath: this.requirePath,
          }),
        })
      ).json();
      filtersModal.html('');
      state.filterValues = {};
      for (const fKey in filters) {
        filtersModal.append(
          PluginWrapper.createFilterElement([fKey, filters[fKey]]),
          $('<hr>'),
        );
        state.filterValues[fKey] = {
          type: filters[fKey].type,
          value: filters[fKey].value,
        };
      }
    } catch (e) {
      console.error(e);
    }
  }
  /**
   * @param {string} name
   * @param {string | undefined} data
   */
  static createInfoItem = (name, data) => {
    /** @type {JQuery<HTMLDivElement>} */
    const info_item = $('<div>');
    info_item.addClass('info-item');
    // many data but one datum
    const datum = data || 'undefined';
    $('<div>')
      .addClass('info-name btn btn-info disabled')
      .text(name)
      .appendTo(info_item);
    $('<samp>')
      .addClass('info-value btn-light')
      .text(datum.slice(0, 50))
      .appendTo(info_item);
    $('<div>')
      .addClass('info-copy btn btn-primary')
      .text('Copy')
      .on('click', () => {
        navigator.clipboard.writeText(datum);
      })
      .appendTo(info_item);
    return info_item;
  };

  /**
   * @param {NovelItem} novel
   * @param {{target:AccordionBox}|undefined} parsable
   * @returns
   */
  static createNovelItem(novel, parsable = undefined) {
    /** @type {JQuery<HTMLDivElement>} */
    const novel_item = $(`<div>`);
    novel_item.addClass('novel-item');
    const novel_image = $('<div>').addClass('novel-img').appendTo(novel_item);
    $('<img>')
      .attr('src', novel.cover || '')
      .attr('alt', 'No cover found')
      .appendTo(novel_image);
    /** @type {JQuery<HTMLDivElement>} */
    const novel_info = $('<div>');
    novel_info.addClass('novel-info').appendTo(novel_item);
    this.createInfoItem('name', novel.name).appendTo(novel_info);
    this.createInfoItem('path', novel.path).appendTo(novel_info);
    this.createInfoItem('cover', novel.cover || 'undefined').appendTo(
      novel_info,
    );
    if (parsable)
      novel_info.append(
        $('<div>')
          .addClass('btn btn-primary parse-novel-btn')
          .text('Parse')
          .on('click', () => {
            // parsable.target.toggle();
            /** @type {JQuery<AccordionBox>} */
            const pnc = $('#parseNovel');
            const box = pnc[0];
            $('#parse-novel-path').val(novel.path);
            $('#parse-novel-btn').trigger('click');
            if (box.collapsed) {
              box.toggle();
              setTimeout(() => {
                // scroll after it un-collapses
                box.scrollIntoView({
                  behavior: 'smooth',
                });
              }, 500);
            } else box.scrollIntoView({ behavior: 'smooth' });
          }),
      );
    return novel_item;
  }

  /** @param {ChapterItem} chapter */
  static createChapterItem(chapter) {
    /**
     * @type {JQuery<HTMLDivElement>}
     */
    const chapter_item = $('<div>');
    chapter_item.addClass('chapter-item');
    $('<samp>')
      .addClass('info-value btn-light ci-topleft')
      .text(chapter.name?.slice(0, 26))
      .appendTo(chapter_item);
    $('<samp>')
      .addClass('info-value btn-light ci-bottomleft')
      .text(chapter.releaseTime || 'undefined')
      .appendTo(chapter_item);
    $('<div>')
      .addClass('info-copy btn btn-primary ci-btn1')
      .attr('data', chapter.path)
      .text('Copy path')
      .on('click', () => {
        navigator.clipboard.writeText(chapter.path);
      })
      .appendTo(chapter_item);
    $('<div>')
      .addClass('info-copy btn btn-primary ci-btn2')
      .attr('data', chapter.path)
      .text('Parse')
      .on('click', () => {
        /** @type {JQuery<AccordionBox>} */
        const parseChapter = $('#parseChapter');
        const box = parseChapter[0];
        $('#chapter-parse-path').val(chapter.path);
        $('#chapter-parse-btn').trigger('click');
        if (box.collapsed) {
          box.toggle();
          setTimeout(() => {
            // scroll after it un-collapses
            box.scrollIntoView({
              behavior: 'smooth',
            });
          }, 500);
        } else box.scrollIntoView({ behavior: 'smooth' });
      })
      .appendTo(chapter_item);
    return chapter_item;
  }

  async getPopularNovels() {
    popularNovels_spinner.show();
    /** @type {FilterToValues<Filters>} */
    const filters = { ...state.filterValues };
    try {
      await state.popular_pages.fetchNovels(async (page, latest) => {
        console.log('Asking for page #', page);
        const novels = await (
          await fetchFromAPI(`/popularNovels/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              showLatestNovels: latest,
              pluginRequirePath: this.requirePath,
              filters: filters,
              page,
            }),
          })
        ).json();
        if ('error' in novels)
          throw `popularNovels threw an error:<div class='error'>${novels.error}</div>`;
        return novels;
      });
      state.popular_pages.showNextPage();
    } catch (/** @type {unknown}*/ e) {
      console.error(e);
      if (e)
        popularNovels_novel_list.html(
          `${typeof e === 'object' && 'message' in e ? e.message : e}`,
        );
    } finally {
      popularNovels_spinner.hide();
    }
  }

  async getSearchedNovels() {
    /** @type {JQuery<AccordionBox>} */
    const accordionBox = $('#searchNovels');
    /** @type {JQuery<HTMLInputElement>} */
    const searchBox = $('#searchNovels input');
    const searchTerm = searchBox.val();
    const spinner = $('#searchNovels .spinner-border');
    spinner.show();
    try {
      await state.search_pages.fetchNovels(async (n, _) => {
        const novels = await (
          await fetchFromAPI(`/searchNovels/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pluginRequirePath: this.requirePath,
              searchTerm: searchTerm,
              page: n,
            }),
          })
        ).json();
        if ('error' in novels)
          throw `searchNovels threw an error:<div class='error'>${novels.error}</div>`;
        return novels;
      });
      state.search_pages.showNextPage();
    } catch (/** @type {unknown} */ e) {
      console.error(e);
      if (e)
        seacrhNovels_novel_list.html(
          `${typeof e === 'object' && 'message' in e ? e.message : e}`,
        );
    } finally {
      spinner.hide();
    }
  }

  async getNovel() {
    /** @type {JQuery<HTMLInputElement>} */
    const novelPathInput = $('#parseNovel input');
    const novel_item = $('#parseNovel .novel-item');
    const chapter_list = $('#parseNovel .chapter-list');
    const novelPath = novelPathInput.val();
    const spinner = $('#parseNovel .spinner-border');
    spinner.show();
    try {
      /** @type {SourceNovel  | {error:string}} */
      const sourceNovel = await (
        await fetchFromAPI(`/parseNovel/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pluginRequirePath: this.requirePath,
            novelPath,
          }),
        })
      ).json();
      if ('error' in sourceNovel)
        throw `Error getting the novel ${sourceNovel.error}`;
      novel_item.empty();
      const novel_data = PluginWrapper.createNovelItem({
        name: sourceNovel.name || 'undefined',
        path: sourceNovel.path,
        cover: sourceNovel.cover,
      });

      novel_data
        .children('div + div')
        .append(
          PluginWrapper.createInfoItem('summary', sourceNovel.summary),
          PluginWrapper.createInfoItem('author', sourceNovel.author),
          PluginWrapper.createInfoItem('artist', sourceNovel.artist),
          PluginWrapper.createInfoItem('status', sourceNovel.status),
          PluginWrapper.createInfoItem('genres', sourceNovel.genres),
        );
      if (sourceNovel.totalPages) {
        novel_data
          .children('div + div')
          .append(
            PluginWrapper.createInfoItem(
              'totalPages',
              sourceNovel.totalPages.toString(),
            ),
          );
      }
      novel_item.replaceWith(novel_data);

      if (
        sourceNovel?.chapters?.length !==
        new Set(sourceNovel?.chapters?.map(r => r.path) || []).size
      ) {
        alert('Chapter paths are the same!');
      }

      chapter_list.html('');
      if (sourceNovel.chapters)
        for (const chapter of sourceNovel.chapters) {
          chapter_list.append(PluginWrapper.createChapterItem(chapter));
        }
    } catch (/** @type {unknown} */ e) {
    } finally {
      spinner.hide();
    }
  }
  async getPage() {
    /** @type {JQuery<HTMLInputElement>} */
    const novelPathInput = $('#parsePage #parse-page-novel-path');
    const pageInput = $('#parsePage #parse-page-index');
    const latestChapter_item = $('#parseNovel latest-chapter-item');
    const chapter_list = $('#parsePage .chapter-list');
    const novelPath = novelPathInput.val();
    const page = pageInput.val();
    const spinner = $('#parsePage .spinner-border');
    spinner.show();
    try {
      /** @type {SourcePage  | {error:string}} */
      const sourcePage = await (
        await fetchFromAPI(`/parsePage/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pluginRequirePath: this.requirePath,
            novelPath,
            page,
          }),
        })
      ).json();
      if ('error' in sourcePage)
        throw `Error getting the novel ${sourcePage.error}`;
      latestChapter_item.empty();
      if (sourcePage.latestChapter) {
        latestChapter_item.append(
          PluginWrapper.createChapterItem(sourcePage.latestChapter),
        );
      }
      if (
        sourcePage?.chapters?.length !==
        new Set(sourcePage?.chapters?.map(r => r.path) || []).size
      ) {
        alert('Chapter paths are the same!');
      }

      chapter_list.html('');
      if (sourcePage.chapters)
        for (const chapter of sourcePage.chapters) {
          chapter_list.append(PluginWrapper.createChapterItem(chapter));
        }
    } catch (/** @type {unknown} */ e) {
    } finally {
      spinner.hide();
    }
  }
  async getChapter() {
    const chapterPath = $('#parseChapter input').val();
    const chapterRawTextarea = $('#parseChapter textarea');
    const spinner = $('#parseChapter .spinner-border');
    spinner.show();
    try {
      const chapterText = await (
        await fetchFromAPI(`/parseChapter/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pluginRequirePath: this.requirePath,
            chapterPath,
          }),
        })
      ).text();
      PluginWrapper.previewSettings.html = chapterText;
      PluginWrapper.previewSettings.sanitizedHTML =
        window.sanitizeChapterText(chapterText);
      this.refreshPreview();
    } catch (e) {
      console.error(e);
      if (e)
        chapterRawTextarea.text(
          `${typeof e === 'object' && 'message' in e ? e.message : e}`,
        );
    } finally {
      spinner.hide();
    }
  }

  /**
   * @param {Window | null} iframeWindow
   */
  loadHTMLToIFrame = async iframeWindow => {
    const text = PluginWrapper.previewSettings.htmlTemplate.replace(
      /\/\*\{(.*)\}\*\//gi,
      function (s, p1) {
        /** @type {[(keyof PluginWrapper.previewSettings), (keyof PluginWrapper.previewSettings[keyof PluginWrapper.previewSettings])?]} */
        const dotted = p1.split('.').map((/** @type {string} */ r) => r.trim());
        const [key1, key2] = dotted;
        if (dotted.length === 1) {
          if (key1 === 'html') {
            return `${
              PluginWrapper.previewSettings.sanitize
                ? PluginWrapper.previewSettings.sanitizedHTML
                : PluginWrapper.previewSettings.html
            }`;
          }
          return `${PluginWrapper.previewSettings[key1]}`;
        } else if (dotted.length === 2 && key2) {
          return `${PluginWrapper.previewSettings[key1][key2]}`;
        }
        return '';
      },
    );
    PluginWrapper.clocks.push(
      setTimeout(() => {
        if (iframeWindow) {
          const html = iframeWindow.document.querySelector('html');
          if (html) {
            PluginWrapper.clocks.push(
              setTimeout(() => {
                // @ts-ignore
                iframeWindow?.eval(PluginWrapper.previewSettings.customJS);
              }, 10),
            );
            html.innerHTML = text;
          } else {
            console.error('No html object inside the iframe');
          }
        } else console.error('No iframe window yet!');
      }, 10),
    );
  };

  showChapterPreview() {
    PluginWrapper.clocks.forEach(c => {
      clearTimeout(c);
    });
    this.currentView = 'preview';
    chapterViewer.empty();
    // create the iframe
    /** @type {JQuery<HTMLIFrameElement>} */
    const iframe = $('<iframe>');
    iframe.attr('id', 'preview');
    iframe.css({
      width: `${PluginWrapper.previewSettings.iframeSize.width}px`,
      height: `${PluginWrapper.previewSettings.iframeSize.height}px`,
    });
    $('#scaled-info').text('');
    $('#parseChapter').css({ 'max-height': 'unset' });
    // the thing is too big!
    if (
      PluginWrapper.previewSettings.iframeSize.width >
      window.innerWidth - 75
    ) {
      const factor =
        (window.innerWidth - 75) /
        PluginWrapper.previewSettings.iframeSize.width;
      iframe.css({
        transform: `scale(${factor})`,
        'transform-origin': 'top left',
      });
      $('#scaled-info').text(
        `Scaled ${(factor * 100).toFixed(2)}% to fit on screen!`,
      );
      $('#parseChapter').css({
        'max-height': `${
          PluginWrapper.previewSettings.iframeSize.height * factor + 150
        }px`,
      });
    }
    chapterViewer.append(iframe);
    const iframeWindow = iframe[0].contentWindow;
    this.loadHTMLToIFrame(iframeWindow);
  }

  showRawChapterText() {
    chapterViewer.empty();
    /**
     * @type {JQuery<HTMLTextAreaElement>}
     */
    const chapterRawTextarea = $('<textarea>');
    chapterRawTextarea
      .attr('rows', '10')
      .attr('maxlength', 10000000)
      .appendTo(chapterViewer);
    chapterRawTextarea.addClass('form-control');
    const rawHTML = PluginWrapper.previewSettings.sanitize
      ? PluginWrapper.previewSettings.sanitizedHTML
      : PluginWrapper.previewSettings.html;
    if (rawHTML) {
      chapterRawTextarea.text(rawHTML);
    } else chapterRawTextarea.text('');
    this.currentView = 'raw';
  }

  toggleChapterView(nochange = false) {
    if (!nochange) {
      this.currentView = this.currentView === 'raw' ? 'preview' : 'raw';
    }
    if (this.currentView === 'preview') this.showChapterPreview();
    else this.showRawChapterText();
    previewSwitch
      .siblings('span')
      .text(this.currentView === 'preview' ? 'Preview' : 'Raw');
  }

  /**
   * @param {boolean | undefined} forcedValue
   */
  static toggleHTMLSanitize(forcedValue) {
    PluginWrapper.previewSettings.sanitize =
      forcedValue ?? !PluginWrapper.previewSettings.sanitize;
    currentWrapper().refreshPreview();
    $('#sanitize-preview-html')
      .siblings('span')
      .text(
        PluginWrapper.previewSettings.sanitize
          ? 'Sanitized HTML'
          : 'Unsanitized HTML',
      );
  }

  refreshPreview() {
    this.toggleChapterView(true);
  }

  async fetchImage() {
    const url = $('#fetchImage input').val();
    const spinner = $('#fetchImage .spinner-border');
    spinner.show();
    try {
      const base64 = await (
        await fetchFromAPI(`/fetchImage/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pluginRequirePath: this.requirePath,
            url: url,
          }),
        })
      ).text();
      $('#fetchImage img').attr('src', `data:image/jpg;base64,${base64}`);
    } catch (e) {
      console.error(e);
      if (e)
        $('#fetchImage').text(
          `${typeof e === 'object' && 'message' in e ? e.message : e}`,
        );
    } finally {
      spinner.hide();
    }
  }

  async resolveUrl() {
    const type = $('#resolveUrl select').val();
    const path = $('#resolveUrl input').val();
    const spinner = $('#resolveUrl .spinner-border');
    spinner.show();
    try {
      const fullURL = await (
        await fetchFromAPI('/resolveUrl/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pluginRequirePath: this.requirePath,
            isNovel: type === 'novel',
            path,
          }),
        })
      ).text();
      $('#resolveUrl input[readonly]').val(fullURL);
    } catch (e) {
      console.error(e);
      if (e)
        $('#resolveUrl').text(
          `${typeof e === 'object' && 'message' in e ? e.message : e}`,
        );
    } finally {
      spinner.hide();
    }
  }
}
const currentWrapper = () => state.current_plugin || emptyPluginWrapper;
const emptyPluginWrapper = new PluginWrapper('');

// #region headers
/** @type {Record<string,string>} */
let lastCopiedHeaders = {};

const getHeaders = () => {
  /** @type {Record<string,string>} */
  const headers = {};
  const els = document.querySelectorAll('.headerinfo').forEach(el => {
    /** @type {HTMLSpanElement | null} */
    const nameSpan = el.querySelector('.headername');
    /** @type {HTMLSpanElement | null} */
    const valueSpan = el.querySelector('.headervalue');
    if (nameSpan && valueSpan) {
      const { innerText: name } = nameSpan;
      const { innerText: value } = valueSpan;
      if (
        typeof name === 'string' &&
        typeof value === 'string' &&
        value.trim()
      ) {
        headers[name] = value.trim();
      }
    }
  });
  return headers;
};

const checkIfHeadersChanged = () => {
  const currentHeaders = getHeaders();

  const headers = new Set(Object.keys(currentHeaders));
  // quick exit if all custom headers removed
  if (headers.size <= 2) {
    $('#headersnotcopied').css({ display: 'none' });
    return;
  }

  // get a list of all headers
  for (const headername of Object.keys(lastCopiedHeaders)) {
    headers.add(headername);
  }

  headers.delete('Cookie');
  headers.delete('User-Agent');

  let headersChanged = false;
  // check if they're all the same
  for (const headername of Array.from(headers)) {
    if (currentHeaders[headername] !== lastCopiedHeaders[headername])
      headersChanged = true;
  }

  if (headersChanged) $('#headersnotcopied').css({ display: 'block' });
  else $('#headersnotcopied').css({ display: 'none' });
};
// #endregion

// #region preview

const loadThemePreset = (/** @type {Theme} */ t) => {
  PluginWrapper.previewSettings.theme = t;
  PluginWrapper.previewSettings.readerSettings = {
    ...PluginWrapper.previewSettings.readerSettings,
    textColor: t.textColor,
    theme: t.backgroundColor,
  };
};

const refreshPreviewSettings = () => {
  /**
   * @param {number} w
   * @param {number} h
   */
  const setPreviewSize = (w, h) => {
    const { iframeSize } = PluginWrapper.previewSettings;
    [iframeSize.width, iframeSize.height] = [w, h];
    width[0].value = `${iframeSize.width}`;
    height[0].value = `${iframeSize.height}`;
    currentWrapper().refreshPreview();
  };

  /** @type {JQuery<HTMLInputElement>} */
  const width = $('#width-input');
  if (width[0])
    width[0].value = `${PluginWrapper.previewSettings.iframeSize.width}`;
  width.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.iframeSize.width = parseFloat(value);
    currentWrapper().refreshPreview();
  });

  /** @type {JQuery<HTMLInputElement>} */
  const height = $('#height-input');
  if (height[0])
    height[0].value = `${PluginWrapper.previewSettings.iframeSize.height}`;
  height.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.iframeSize.height = parseFloat(value);
    currentWrapper().refreshPreview();
  });

  $('#swap-iframe-size')
    .off('click')
    .on('click', () => {
      const { width, height } = PluginWrapper.previewSettings.iframeSize;
      setPreviewSize(height, width);
    });

  $('#load-preset-size')
    .off('click')
    .on('click', () => {
      /** @type {JQuery<HTMLSelectElement>} */
      const select = $('#size-preset');
      const [wStr, hStr] = select[0].value.split(',');
      if (wStr && hStr && parseInt(wStr) && parseInt(hStr))
        setPreviewSize(parseInt(wStr), parseInt(hStr));
    });

  /** @type {JQuery<HTMLInputElement>}*/
  const shouldSanitizeHTML = $('#sanitize-preview-html');
  if (shouldSanitizeHTML[0])
    PluginWrapper.toggleHTMLSanitize(shouldSanitizeHTML[0].checked);
  shouldSanitizeHTML.off('click').on('click', ({ target: { checked } }) => {
    PluginWrapper.toggleHTMLSanitize(checked);
  });

  /** @type {JQuery<HTMLInputElement>} */
  const lineHeight = $('#lh-input');
  if (lineHeight[0])
    lineHeight[0].value = `${PluginWrapper.previewSettings.readerSettings.lineHeight}`;
  lineHeight.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.readerSettings.lineHeight = parseFloat(value);
    currentWrapper().refreshPreview();
  });

  /** @type {JQuery<HTMLInputElement>} */
  const backgroundColor = $('#bgc-input');
  if (backgroundColor[0])
    backgroundColor[0].value = `${PluginWrapper.previewSettings.readerSettings.theme}`;
  backgroundColor.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.readerSettings.theme = value;
    currentWrapper().refreshPreview();
  });

  /** @type {JQuery<HTMLInputElement>} */
  const textColor = $('#txt-input');
  if (textColor[0])
    textColor[0].value = `${PluginWrapper.previewSettings.readerSettings.textColor}`;
  textColor.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.readerSettings.textColor = value;
    currentWrapper().refreshPreview();
  });

  /** @type {JQuery<HTMLInputElement>} */
  const fontSize = $('#fs-input');
  if (fontSize[0])
    fontSize[0].value = `${PluginWrapper.previewSettings.readerSettings.textSize}`;
  fontSize.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.readerSettings.textSize = parseFloat(value);
    currentWrapper().refreshPreview();
  });

  /** @type {JQuery<HTMLSelectElement>} */
  const textAlign = $('#ta-input');
  textAlign.off('change').on('change', ({ target: { selectedOptions } }) => {
    PluginWrapper.previewSettings.readerSettings.textAlign =
      selectedOptions[0].value;
    currentWrapper().refreshPreview();
  });

  /** @type {JQuery<HTMLTextAreaElement>} */
  const customCSS = $('#css-ta');
  if (customCSS[0])
    customCSS[0].value = PluginWrapper.previewSettings.customCSS;
  customCSS.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.customCSS = value;
    currentWrapper().refreshPreview();
  });

  /** @type {JQuery<HTMLTextAreaElement>} */
  const customJS = $('#js-ta');
  if (customJS[0]) customJS[0].value = PluginWrapper.previewSettings.customJS;
  customJS.off('change').on('change', ({ target: { value } }) => {
    PluginWrapper.previewSettings.customJS = value;
    currentWrapper().refreshPreview();
  });
};

// #endregion

// load plugin

const load_plugin = (/** @type {HTMLButtonElement} */ btn) => {
  const ele = $(btn);
  const plugin_requirePath = ele.attr('data-require');
  if (!plugin_requirePath) return;
  state.current_plugin = new PluginWrapper(plugin_requirePath);
  plugin_search.attr('data-require', plugin_requirePath);
  plugin_search.val(ele.text().split('/')[1]);
  state.popular_pages.reset();
  state.search_pages.reset();
  destroySearchTurnOffBox();
  state.current_plugin.getFilters().then(() => {
    $('#loadedplugin').text('Loaded: ' + btn.innerText);
  });
};

// #region plugin search

const loadPluginsIntoSearchBar = () => {
  const { language, keyword } = state.plugin_search;
  const plugins = language ? state.all_plugins[language] : state.plugin_infos;
  state.plugins_in_search = keyword
    ? plugins.filter(p =>
        keyword.charAt(0) === '-'
          ? !p.name.toLowerCase().includes(keyword.toLowerCase().substring(1))
          : p.name.toLowerCase().includes(keyword.toLowerCase()),
      )
    : plugins;
};

fetchFromAPI('/all_plugins')
  .then(res => res.json())
  .then((/** @type {PluginList} */ all) => {
    state.all_plugins = all;
    for (let lang in all) {
      plugin_language_selection.append(`<option>${lang}</option>`);
      state.plugin_infos = state.plugin_infos.concat(all[lang]);
    }
  });

const destroySearchTurnOffBox = () => {
  $('#turnoff-catch').trigger('click');
};

const createSearchTurnOffBox = () => {
  // if there is no unclick box
  if (!$('#turnoff-catch').length) {
    // create it
    const turnoff_catch = $('<div>').attr('id', 'turnoff-catch');
    $('body').append(turnoff_catch);
    turnoff_catch.on('click', () => {
      plugin_search_results.hide();
      turnoff_catch.remove();
    });
  }
};

const display_plugin_search = () => {
  plugin_search_results.hide();
  plugin_search_results.empty();
  createSearchTurnOffBox();
  state.plugins_in_search.forEach(plugin => {
    /** @type {JQuery<HTMLImageElement>} */
    const img = $('<img>', { src: `./icons/${plugin.icon}` });
    img.css({
      height: '100%',
      'object-fit': 'contains',
      'margin-right': '10px',
    });
    /** @type {JQuery<HTMLButtonElement>} */
    const btn = $('<button>', {
      type: 'button',
      class: 'search-item btn btn-light btn-outline-primary btn-md btn-block',
    });
    btn
      .css({
        display: 'flex',
        'align-items': 'center',
        height: '30px',
        'flex-shrink': 0,
      })
      .attr('data-require', `${plugin.requirePath}`)
      .on('click', e => {
        load_plugin(e.target);
      });
    /** @type {JQuery<HTMLDivElement>} */
    const div = $('<div>');
    div.css({
      display: 'flex',
      'align-items': 'center',
    });
    btn.append(img).append(`${plugin.lang}/${plugin.name}`);
    div.append(btn);
    plugin_search_results.append(div);
  });
  plugin_search_results.show();
};
// #endregion

// #region event handlers
plugin_language_selection.on('change', e => {
  state.plugin_search.language = e.target.value;
  loadPluginsIntoSearchBar();
});

plugin_search.on('focus', () => {
  if (!state.all_plugins) return;
  plugin_search[0].selectionStart = 0;
  plugin_search[0].selectionEnd = plugin_search.val()?.length || 0;
  loadPluginsIntoSearchBar();
  display_plugin_search();
});

plugin_search.on('keyup', e => {
  state.plugin_search.keyword = e.target.value;
  loadPluginsIntoSearchBar();
  display_plugin_search();
});

clear_plugin_search.on('click', e => {
  plugin_search_results.hide();
  plugin_search.val('');
  plugin_search.attr('data-require', '');
});

previewSwitch.on('change', () => {
  currentWrapper().toggleChapterView();
});

// get all header inputs and check if headers changed after
$(".headerinfo > span[contenteditable='true']").each((_, inputElement) => {
  $(inputElement).on('input', checkIfHeadersChanged);
});

latestSwitch.on('change', () => {
  const label = latestSwitch.siblings('span');
  /** @type {JQuery<HTMLInputElement>} */
  const filtersBtn = $('#filters-btn');
  if (latestSwitch[0].checked) {
    state.popular_pages.showLatest = true;
    filtersBtn[0].disabled = true;
    label.text('Latest');
  } else {
    state.popular_pages.showLatest = false;
    filtersBtn[0].disabled = false;
    label.text('Popular');
  }
});

searchNovels_searchbar.on('keyup', () => {
  state.search_pages.reset();
});

$('#addheaderbtn').on('click', () => {
  /**
     <div class="headerinfo" data-headername="Cookie">
        <span class="headername" onclick="this.nextElementSibling.nextElementSibling.focus()">Cookie</span><b>:&nbsp;</b>
        <span class="headervalue" contenteditable="true" ></span>
    </div>
     */
  const nameSpan = $('<span>').addClass('headername');
  const valueSpan = $('<span>').addClass('headervalue');
  const separator = $('<b>').html(':&nbsp;');
  const clearButton = $('<button>')
    .text('Clear')
    .addClass('headereditbutton')
    .on('click', () => {
      valueSpan.text('');
      checkIfHeadersChanged();
    });
  const removeButton = $('<button>')
    .text('Remove')
    .addClass('headereditbutton');
  nameSpan[0].contentEditable = 'true';
  valueSpan[0].contentEditable = 'true';
  nameSpan.on('input', checkIfHeadersChanged);
  valueSpan.on('input', checkIfHeadersChanged);
  const headerinfo = $('<div>')
    .append(nameSpan, separator, valueSpan, clearButton, removeButton)
    .attr('class', 'headerinfo');
  removeButton.on('click', () => {
    headerinfo.remove();
    checkIfHeadersChanged();
  });
  $('#headerinfos').append(headerinfo);
});

$('#copyascode').on('click', async () => {
  const headers = getHeaders();
  const strippedHeaders = {
    ...headers,
  };
  delete strippedHeaders['Cookie'];
  delete strippedHeaders['User-Agent'];
  await navigator.clipboard.writeText(JSON.stringify(strippedHeaders, null, 4));
  lastCopiedHeaders = headers;
  checkIfHeadersChanged();
  $('#headerscopied').css({ display: 'block' });
  setTimeout(() => $('#headerscopied').css({ display: 'none' }), 1000);
});

// buttons:
$('.popularNovels-btn').on('click', () =>
  state.current_plugin?.getPopularNovels(),
);

$('.searchNovels-btn').on('click', () =>
  state.current_plugin?.getSearchedNovels(),
);

$('.parseNovel-btn').on('click', () => state.current_plugin?.getNovel());
$('.parsePage-btn').on('click', () => state.current_plugin?.getPage());

$('.parseChapter-btn').on('click', () => state.current_plugin?.getChapter());
$('.fetchImage-btn').on('click', () => state.current_plugin?.fetchImage());
$('.resolveUrl-btn').on('click', () => state.current_plugin?.resolveUrl());

// #endregion

// JQuery document.body.onload
$(() => {
  /** @type {JQuery<HTMLSpanElement>} */
  const userAgentInput = $('[data-headername="User-Agent"] .headervalue');
  if (userAgentInput.length) {
    userAgentInput.text(navigator.userAgent);
  }
  // TODO read the values from localstorage
  state.plugin_search.keyword = plugin_search[0].value;
  PluginWrapper.previewSettings.sanitize = false;
  Promise.allSettled([
    fetchFromAPI('static/html/template.html')
      .then(r => r.text())
      .then(t => {
        PluginWrapper.previewSettings.htmlTemplate = t;
      }),
    fetchFromAPI(
      'https://raw.githubusercontent.com/LNReader/lnreader/plugins/android/app/src/main/assets/css/index.css',
    )
      .then(r => r.text())
      .then(t => (PluginWrapper.previewSettings.fillCSS = t)),
    fetchFromAPI(
      'https://raw.githubusercontent.com/LNReader/lnreader/plugins/android/app/src/main/assets/js/index.js',
    )
      .then(r => r.text())
      .then(t => (PluginWrapper.previewSettings.fillJS = t)),
  ]).then(() => {
    emptyPluginWrapper.refreshPreview();
  });
  latestSwitch.trigger('change');
  for (const key in window.themes) {
    const t = window.themes[key];
    const picker = $('#theme-picker');
    picker.append(
      $('<div>')
        .text(PluginWrapper.previewSettings.theme === t ? '✓' : 'A')
        .addClass('theme')
        .css({
          'background-color': t.backgroundColor,
          color: t.textColor,
        })
        .attr('id', key)
        .on('click', x => {
          loadThemePreset(t);
          refreshPreviewSettings();
          currentWrapper().refreshPreview();
          $('#theme-picker .theme').each((e, el) => {
            el.innerText = el.id === key ? '✓' : 'A';
          });
        }),
    );
  }
  refreshPreviewSettings();
  lastCopiedHeaders = getHeaders();
  checkIfHeadersChanged();
});
