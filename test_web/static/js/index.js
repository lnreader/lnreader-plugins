// @ts-check
/* Imports */
/** @typedef {import("@libs/filterInputs").Filters} Filters */
/** @typedef {import("@typings/types").PluginList} PluginList */
/** @typedef {import("@typings/plugin").Plugin.PluginItem} PluginItem */
/** @typedef {import("@typings/plugin").Plugin.ChapterItem} ChapterItem */
/** @typedef {import("@typings/plugin").Plugin.NovelItem} NovelItem */
/** @typedef {import("@typings/plugin").Plugin.SourceNovel} SourceNovel */
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

/// <reference path="./types.d.ts" />

const state = {
    /** @type {PluginList} */
    all_plugins: {},
    /** @type {Array<PluginItem>} */
    plugin_infos: [],
    /** @type {{language: string, keyword:null|string}} */
    plugin_search: {
        language: "",
        keyword: null,
    },
    /** @type {Array<PluginItem>} */
    plugins_in_search: [],
    /** @type {PluginWrapper | undefined} */
    current_plugin: undefined,
    /** @type {FilterToValues<Filters>} */
    filterValues: {},
};

/** @type {JQuery<HTMLSelectElement>}*/
const language_selection = $("#language");
/** @type {JQuery<HTMLInputElement>} */
const plugin_search = $("#plugin");
/** @type {JQuery<HTMLDivElement>} */
const search_results = $("#search-results");

const getHeaders = () => {
    /** @type {Record<string,string>} */
    const headers = {};
    const els = document.querySelectorAll(".headerinfo").forEach((el) => {
        /** @type {HTMLSpanElement | null} */
        const nameSpan = el.querySelector(".headername");
        /** @type {HTMLSpanElement | null} */
        const valueSpan = el.querySelector(".headervalue");
        if (nameSpan && valueSpan) {
            const { innerText: name } = nameSpan;
            const { innerText: value } = valueSpan;
            if (typeof name === "string" && typeof value === "string") {
                headers[name] = value;
            }
        }
    });
    return headers;
};

/**
 *
 * @param {string} path
 * @param {RequestInit | undefined} init
 */
const fetchFromAPI = async (path, init = undefined) => {
    if (init) {
        init.headers = {
            ...init.headers,
            "x-custom-headers": JSON.stringify(getHeaders()),
        };
    }
    return fetch(path, init);
};

const loadPluginsIntoSearchBar = () => {
    const { language, keyword } = state.plugin_search;
    const plugins = language ? state.all_plugins[language] : state.plugin_infos;
    state.plugins_in_search = keyword
        ? plugins.filter((p) =>
              keyword.charAt(0) === "-"
                  ? !p.name
                        .toLowerCase()
                        .includes(keyword.toLowerCase().substring(1))
                  : p.name.toLowerCase().includes(keyword.toLowerCase())
          )
        : plugins;
};

fetchFromAPI("/all_plugins")
    .then((res) => res.json())
    .then((/** @type {PluginList} */ all) => {
        state.all_plugins = all;
        for (let lang in all) {
            language_selection.append(`<option>${lang}</option>`);
            state.plugin_infos = state.plugin_infos.concat(all[lang]);
        }
    })
    .then((_) => {
        loadPluginsIntoSearchBar();
    });

language_selection.on("change", (e) => {
    state.plugin_search.language = e.target.value;
    loadPluginsIntoSearchBar();
});

const display_search = () => {
    search_results.hide();
    search_results.empty();
    if (!$("#turnoff-catch").length) {
        const turnoff_catch = $("<div>").attr("id", "turnoff-catch");
        $("body").append(turnoff_catch);
        turnoff_catch.on("click", () => {
            search_results.hide();
            turnoff_catch.remove();
        });
    }
    state.plugins_in_search.forEach((plugin) => {
        // search_results.append(`
        //     <div style="display: flex; align-items: center;">
        //         <button style="display: flex; align-items: center; height: 30px; flex-shrink: 0;" data-require="${plugin.requirePath}" onclick="test_plugin(this)" type="button" class="search-item btn btn-light btn-outline-primary btn-md btn-block">
        //             <img src="./icons/${plugin.icon}" style="height: 100%; object-fit: contain; margin-right: 10px;">
        //             ${plugin.lang}/${plugin.name}
        //         </button>
        //     </div>
        // `);

        /** @type {JQuery<HTMLImageElement>} */
        const img = $("<img>", { src: `./icons/${plugin.icon}` });
        img.css({
            height: "100%",
            "object-fit": "contains",
            "margin-right": "10px",
        });
        /** @type {JQuery<HTMLButtonElement>} */
        const btn = $("<button>", {
            type: "button",
            class: "search-item btn btn-light btn-outline-primary btn-md btn-block",
        });
        btn.css({
            display: "flex",
            "align-items": "center",
            height: "30px",
            "flex-shrink": 0,
        })
            .attr("data-require", `${plugin.requirePath}`)
            .on("click", (e) => {
                test_plugin(e.target);
            });
        /** @type {JQuery<HTMLDivElement>} */
        const div = $("<div>");
        div.css({
            display: "flex",
            "align-items": "center",
        });
        btn.append(img).append(`${plugin.lang}/${plugin.name}`);
        div.append(btn);
        search_results.append(div);
    });
    search_results.show();
};

plugin_search.on("focus", () => {
    if (!state.all_plugins) return;
    plugin_search[0].selectionStart = 0;
    plugin_search[0].selectionEnd = plugin_search.val()?.length || 0;
    loadPluginsIntoSearchBar();
    display_search();
});

plugin_search.on("keyup", (e) => {
    state.plugin_search.keyword = e.target.value;
    loadPluginsIntoSearchBar();
    display_search();
});

$("#clear-search").on("click", (e) => {
    search_results.hide();
    plugin_search.val("");
    plugin_search.attr("data-require", "");
});

const test_plugin = (/** @type {HTMLButtonElement} */ btn) => {
    const ele = $(btn);
    const plugin_requirePath = ele.attr("data-require");
    if (!plugin_requirePath) return;
    state.current_plugin = new PluginWrapper(plugin_requirePath);
    plugin_search.attr("data-require", plugin_requirePath);
    plugin_search.val(ele.text().split("/")[1]);
    $("#turnoff-catch").trigger("click");
    state.current_plugin.getFilters();
};

class PluginWrapper {
    /**
     * @param {string} requirePath
     */
    constructor(requirePath) {
        /** @type {string} */
        this.requirePath = requirePath;
        this.currentView = previewSwitch[0].checked ? "preview" : "raw";
    }

    /** @type {JQuery<HTMLDivElement>} */
    chapterViewer = $("#chapter-viewer");
    /** @type {JQuery<HTMLDivElement>} */
    filtersModal = $("#filtersModal .modal-body");

    /**
     * @param {[string,Filters[string]]} flt
     * @returns {JQuery<HTMLDivElement>}
     */
    static createFilterElement(flt) {
        /** @param {string} f */
        const getSafeFilterID = (f) => f.replace(/\s/g, "_").toLowerCase();
        /** @type {JQuery<HTMLDivElement>} */
        const retDiv = $("<div>");
        const [key, filter] = flt;
        retDiv.addClass(`${filter.type}Filter`);
        switch (filter.type) {
            case "Picker":
                {
                    const id = `${key}_picker`;
                    // add label
                    $("<span>")
                        .addClass("filter-label")
                        .text(`${filter.label}:`)
                        .appendTo(retDiv);

                    /** @type {JQuery<HTMLSelectElement>} */
                    const select = $("<select>");
                    // add select and its attributes
                    select
                        .attr("title", `key: ${key}`)
                        .addClass("custom-select")
                        .on("change", (e) => {
                            state.filterValues[key].value =
                                e.target.selectedOptions[0].value;
                        })
                        .appendTo(retDiv);
                    // add all the options
                    for (const option of filter.options) {
                        select.append(
                            `<option ${
                                option.value === filter.value ? "selected" : ""
                            } value='${option.value}'>${option.label}</option>`
                        );
                    }
                }
                break;
            case "Checkbox":
                {
                    // add label
                    $("<span>")
                        .addClass("filter-label")
                        .text(filter.label)
                        .appendTo(retDiv);

                    // create box for checkboxes
                    const box = $("<div>")
                        .appendTo(retDiv)
                        .addClass("checkbox-groupbox");

                    // add all checkboxes
                    for (let cb of filter.options) {
                        const id = `checkbox_${key}_${getSafeFilterID(
                            cb.value
                        )}`;
                        /** @type {JQuery<HTMLInputElement>} */
                        let inp = $("<input>", { type: "checkbox" });
                        // set default value
                        inp[0].checked = filter.value.includes(cb.value);
                        // set checkbox attributes and listeners
                        inp.attr("id", id).on("change", (e) => {
                            const { checked } = e.target;
                            const fV = state.filterValues[key];
                            if (Array.isArray(fV.value)) {
                                fV.value = checked
                                    ? [...fV.value, cb.value]
                                    : fV.value.filter((r) => r !== cb.value);
                            }
                        });
                        // add checkbox label
                        const label = $("<label>", { for: id })
                            .text(cb.label)
                            .prepend(inp)
                            .attr("title", `${key}: ${cb.value}`);
                        $("<div>").append(label).appendTo(box);
                    }
                }
                break;
            case "Switch": {
                const id = `switch_${key}`;
                // add the checkbox
                const slider_checkbox = $("<div>");
                slider_checkbox.addClass("slider-checkbox");
                const label = $("<label>");
                /** @type {JQuery<HTMLInputElement>} */
                const checkbox = $("<input>", { type: "checkbox" });
                checkbox.attr("id", id);
                // set default value
                checkbox[0].checked = filter.value;
                label
                    .append(checkbox, $("<span>").text(filter.label))
                    .appendTo(slider_checkbox);
                slider_checkbox.appendTo(retDiv);
                break;
            }
            case "Text":
                {
                    const id = `text_${key}`;
                    $("<label>", { for: id })
                        .text(filter.label)
                        .addClass("filter-label")
                        .appendTo(retDiv);
                    /** @type {JQuery<HTMLInputElement>} */
                    const inp = $("<input>", { type: "text" });
                    inp.attr("id", id)
                        .on("change", (e) => {
                            const fV = state.filterValues[key];
                            if (typeof fV.value === "string") {
                                fV.value = e.target.value;
                            }
                        })
                        .appendTo(retDiv);
                    // set default value
                    inp.val(filter.value);
                }
                break;
            case "XCheckbox":
                {
                    // add label
                    $("<span>")
                        .addClass("filter-label")
                        .text(filter.label)
                        .appendTo(retDiv);

                    // create box for checkboxes
                    const box = $("<div>")
                        .appendTo(retDiv)
                        .addClass("xcheckbox-groupbox");

                    // add all checkboxes
                    for (let cb of filter.options) {
                        const id = `checkbox_${key}_${getSafeFilterID(
                            cb.value
                        )}`;

                        const getCurrentState = () => {
                            const fV = state.filterValues[key];
                            if (
                                typeof fV.value === "object" &&
                                !Array.isArray(fV.value)
                            ) {
                                return (
                                    (fV.value.exclude?.includes(cb.value) &&
                                        "x") ||
                                    (fV.value.include?.includes(cb.value) &&
                                        "i") ||
                                    false
                                );
                            }
                            return false;
                        };

                        // default State
                        const checkedState =
                            (filter.value.exclude?.includes(cb.value) && "x") ||
                            (filter.value.include?.includes(cb.value) && "i") ||
                            false;

                        /** @type {JQuery<HTMLLabelElement>} */
                        const label = $("<label>", { for: id });
                        label
                            .addClass("xcheckbox")
                            .attr("data-state", checkedState || "");
                        /** @type {JQuery<HTMLInputElement>} */
                        const xchb = $("<input>", { type: "checkbox" });
                        if (checkedState) xchb[0].checked = true;
                        xchb.attr("id", id);
                        label.text(cb.label).append(xchb).append($("<span>"));
                        xchb.on("change", (e) => {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            e.stopPropagation();
                            const fV = state.filterValues[key];
                            if (
                                fV.value instanceof Array ||
                                typeof fV.value !== "object"
                            )
                                return;
                            const curState = getCurrentState();
                            switch (curState) {
                                case "i":
                                    if (fV.value.include)
                                        fV.value.include =
                                            fV.value.include.filter(
                                                (f) => f !== cb.value
                                            );
                                    if (fV.value.exclude)
                                        fV.value.exclude.push(cb.value);
                                    else fV.value.exclude = [cb.value];
                                    e.target.checked = true;
                                    label[0].dataset.state = "x";
                                    break;
                                case "x":
                                    // set to false
                                    if (fV.value.exclude)
                                        fV.value.exclude =
                                            fV.value.exclude.filter(
                                                (f) => f !== cb.value
                                            );
                                    e.target.checked = false;
                                    label[0].dataset.state = "";
                                    break;
                                default:
                                    // set to "e"
                                    if (!fV.value.include)
                                        fV.value.include = [cb.value];
                                    else fV.value.include.push(cb.value);
                                    e.target.checked = true;
                                    label[0].dataset.state = "i";
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
                await fetchFromAPI("/filters", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pluginRequirePath: this.requirePath,
                    }),
                })
            ).json();
            this.filtersModal.html("");
            state.filterValues = {};
            for (const fKey in filters) {
                this.filtersModal.append(
                    PluginWrapper.createFilterElement([fKey, filters[fKey]]),
                    $("<hr>")
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
        const info_item = $("<div>");
        info_item.addClass("info-item");
        // many data but one datum
        const datum = data || "undefined";
        $("<div>")
            .addClass("info-name btn btn-info disabled")
            .text(name)
            .appendTo(info_item);
        $("<samp>")
            .addClass("info-value btn-light")
            .text(datum.slice(0, 50))
            .appendTo(info_item);
        $("<div>")
            .addClass("info-copy btn btn-primary")
            .text("Copy")
            .on("click", () => {
                navigator.clipboard.writeText(datum);
            })
            .appendTo(info_item);
        return info_item;
    };

    /**
     *
     * @param {NovelItem} novel
     * @returns
     */
    static createNovelItem(novel, parsable = false) {
        /** @type {JQuery<HTMLDivElement>} */
        const novel_item = $(`<div>`);
        novel_item.addClass("novel-item");
        $("<img>")
            .attr("src", novel.cover || "")
            .attr("alt", "No cover found")
            .appendTo(novel_item);
        /** @type {JQuery<HTMLDivElement>} */
        const novel_info = $("<div>");
        novel_info.addClass("novel_info").appendTo(novel_item);
        this.createInfoItem("name", novel.name).appendTo(novel_info);
        this.createInfoItem("url", novel.url).appendTo(novel_info);
        this.createInfoItem("cover", novel.cover || "undefined").appendTo(
            novel_info
        );
        if (parsable)
            novel_info.append(
                $("<div>")
                    .addClass("btn btn-primary parse-novel-btn")
                    .text("Parse")
                    .on("click", () => {
                        $("#parse-novel-url").val(novel.url);
                        $("#parseNovelAndChapters")[0].scrollIntoView({
                            behavior: "smooth",
                        });
                        $("#parse-novel-btn").trigger("click");
                    })
            );
        return novel_item;
    }

    /**
     * @param {ChapterItem} chapter
     */
    static createChapterItem(chapter) {
        /**
         * @type {JQuery<HTMLDivElement>}
         */
        const chapter_item = $("<div>");
        chapter_item.addClass("chapter-item");
        $("<samp>")
            .addClass("info-value btn-light ci-topleft")
            .text(chapter.name?.slice(0, 26))
            .appendTo(chapter_item);
        $("<samp>")
            .addClass("info-value btn-light ci-bottomleft")
            .text(chapter.releaseTime || "undefined")
            .appendTo(chapter_item);
        $("<div>")
            .addClass("info-copy btn btn-primary ci-btn1")
            .attr("data", chapter.url)
            .text("Copy url")
            .on("click", () => {
                navigator.clipboard.writeText(chapter.url);
            })
            .appendTo(chapter_item);
        $("<div>")
            .addClass("info-copy btn btn-primary ci-btn2")
            .attr("data", chapter.url)
            .text("Parse")
            .on("click", () => {
                $("#chapter-parse-url").val(chapter.url);
                $("#parseChapter")[0].scrollIntoView({ behavior: "smooth" });
                $("#chapter-parse-btn").trigger("click");
            })
            .appendTo(chapter_item);
        return chapter_item;
    }

    async getPopularNovels() {
        const spinner = $("#popularNovels .spinner-border");
        spinner.show();
        const novel_list = $("#popularNovels .novel-list");
        /** @type {FilterToValues<Filters>} */
        const filters = { ...state.filterValues };
        try {
            /** @type {NovelItem[] | {error:string}} */
            const novels = await (
                await fetchFromAPI(`/popularNovels/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pluginRequirePath: this.requirePath,
                        filters: filters,
                    }),
                })
            ).json();
            // clear the novel_list
            novel_list.html("");

            if ("error" in novels) throw `There was an error! ${novels.error}`;
            if (novels.length === 0) {
                novel_list.text("Couldn't find anything!");
            }
            novel_list.append(
                ...novels.map((novel) =>
                    PluginWrapper.createNovelItem(novel, true)
                )
            );
        } catch (/** @type {unknown}*/ e) {
            console.error(e);
            if (e)
                novel_list.text(
                    `${typeof e === "object" && "message" in e ? e.message : e}`
                );
        } finally {
            spinner.hide();
        }
    }

    async getSearchedNovels() {
        /** @type {JQuery<HTMLInputElement>} */
        const searchBox = $("#searchNovels input");
        const searchTerm = searchBox.val();
        const spinner = $("#searchNovels .spinner-border");
        const novel_list = $("#searchNovels .novel-list");
        spinner.show();
        try {
            /** @type {NovelItem[] | {error:string}} */
            const novels = await (
                await fetchFromAPI(`/searchNovels/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pluginRequirePath: this.requirePath,
                        searchTerm: searchTerm,
                    }),
                })
            ).json();
            novel_list.html("");
            if ("error" in novels) throw `Could not fetch! ${novels.error}`;

            novel_list.append(
                ...novels.map((novel) =>
                    PluginWrapper.createNovelItem(novel, true)
                )
            );
        } catch (/** @type {unknown} */ e) {
            console.error(e);
            if (e)
                novel_list.text(
                    `${typeof e === "object" && "message" in e ? e.message : e}`
                );
        } finally {
            spinner.hide();
        }
    }

    async getNovelAndChapters() {
        /** @type {JQuery<HTMLInputElement>} */
        const novelUrlInput = $("#parseNovelAndChapters input");
        const novel_item = $("#parseNovelAndChapters .novel-list .novel-item");
        const chapter_list = $("#parseNovelAndChapters .chapter-list");
        const novelUrl = novelUrlInput.val();
        const spinner = $("#parseNovelAndChapters .spinner-border");
        spinner.show();
        try {
            /** @type {SourceNovel  | {error:string}} */
            const sourceNovel = await (
                await fetchFromAPI(`/parseNovelAndChapters/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pluginRequirePath: this.requirePath,
                        novelUrl: novelUrl,
                    }),
                })
            ).json();
            if ("error" in sourceNovel)
                throw `Error getting the novel ${sourceNovel.error}`;
            novel_item.empty();
            const novel_data = PluginWrapper.createNovelItem({
                name: sourceNovel.name || "undefined",
                url: sourceNovel.url,
                cover: sourceNovel.cover,
            });

            novel_data
                .children("div")
                .append(
                    PluginWrapper.createInfoItem(
                        "summary",
                        sourceNovel.summary
                    ),
                    PluginWrapper.createInfoItem("author", sourceNovel.author),
                    PluginWrapper.createInfoItem("artist", sourceNovel.artist),
                    PluginWrapper.createInfoItem("status", sourceNovel.status),
                    PluginWrapper.createInfoItem("genres", sourceNovel.genres)
                );
            novel_data.appendTo(novel_item);

            chapter_list.html("");
            if (sourceNovel.chapters)
                for (const chapter of sourceNovel.chapters) {
                    chapter_list.append(
                        PluginWrapper.createChapterItem(chapter)
                    );
                }
        } catch (/** @type {unknown} */ e) {
        } finally {
            spinner.hide();
        }
    }

    async getChapter() {
        const chapterUrl = $("#parseChapter input").val();
        const chapterRawTextarea = $("#parseChapter textarea");
        const spinner = $("#parseChapter .spinner-border");
        spinner.show();
        try {
            const chapterText = await (
                await fetchFromAPI(`/parseChapter/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pluginRequirePath: this.requirePath,
                        chapterUrl: chapterUrl,
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
                    `${typeof e === "object" && "message" in e ? e.message : e}`
                );
        } finally {
            spinner.hide();
        }
    }

    static previewSettings = {
        htmlTemplate: "",
        fillJS: "",
        fillCSS: "",
        customJS: "",
        customCSS: "",
        readerSettings: {
            theme: "#292832",
            textColor: "#CCCCCC",
            textSize: 16,
            textAlign: "left",
            padding: 5,
            fontFamily: "",
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
        html: "",
        sanitizedHTML: "",
        sanitize: true,
        StatusBar: { currentHeight: 0 },
    };

    /** @type {"raw" | "preview"} */
    currentView = "raw";

    /** @type {NodeJS.Timeout[]} */
    static clocks = [];

    /**
     * @param {Window | null} iframeWindow
     */
    loadHTMLToIFrame = async (iframeWindow) => {
        const text = PluginWrapper.previewSettings.htmlTemplate.replace(
            /\/\*\{(.*)\}\*\//gi,
            function (s, p1) {
                /** @type {[(keyof PluginWrapper.previewSettings), (keyof PluginWrapper.previewSettings[keyof PluginWrapper.previewSettings])?]} */
                const dotted = p1
                    .split(".")
                    .map((/** @type {string} */ r) => r.trim());
                const [key1, key2] = dotted;
                if (dotted.length === 1) {
                    if (key1 === "html") {
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
                return "";
            }
        );
        PluginWrapper.clocks.push(
            setTimeout(() => {
                if (iframeWindow) {
                    const html = iframeWindow.document.querySelector("html");
                    if (html) {
                        PluginWrapper.clocks.push(
                            setTimeout(() => {
                                // @ts-ignore
                                iframeWindow?.eval(
                                    PluginWrapper.previewSettings.customJS
                                );
                            }, 10)
                        );
                        html.innerHTML = text;
                    } else {
                        console.error("No html object inside the iframe");
                    }
                } else console.error("No iframe window yet!");
            }, 10)
        );
    };

    showChapterPreview() {
        PluginWrapper.clocks.forEach((c) => {
            clearTimeout(c);
        });
        this.currentView = "preview";
        this.chapterViewer.empty();
        // create the iframe
        /** @type {JQuery<HTMLIFrameElement>} */
        const iframe = $("<iframe>");
        iframe.attr("id", "preview");
        iframe.css({
            width: `${PluginWrapper.previewSettings.iframeSize.width}px`,
            height: `${PluginWrapper.previewSettings.iframeSize.height}px`,
        });
        $("#scaled-info").text("");
        $("#parseChapter").css({ "max-height": "unset" });
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
                "transform-origin": "top left",
            });
            $("#scaled-info").text(
                `Scaled ${(factor * 100).toFixed(2)}% to fit on screen!`
            );
            $("#parseChapter").css({
                "max-height": `${
                    PluginWrapper.previewSettings.iframeSize.height * factor +
                    150
                }px`,
            });
        }
        this.chapterViewer.append(iframe);
        const iframeWindow = iframe[0].contentWindow;
        this.loadHTMLToIFrame(iframeWindow);
    }

    showRawChapterText() {
        this.chapterViewer.empty();
        /**
         * @type {JQuery<HTMLTextAreaElement>}
         */
        const chapterRawTextarea = $("<textarea>");
        chapterRawTextarea
            .attr("rows", "10")
            .attr("maxlength", 10000000)
            .appendTo(this.chapterViewer);
        chapterRawTextarea.addClass("form-control");
        const rawHTML = PluginWrapper.previewSettings.sanitize
            ? PluginWrapper.previewSettings.sanitizedHTML
            : PluginWrapper.previewSettings.html;
        if (rawHTML) {
            chapterRawTextarea.text(rawHTML);
        } else chapterRawTextarea.text("");
        this.currentView = "raw";
    }

    toggleChapterView(nochange = false) {
        if (!nochange) {
            this.currentView = this.currentView === "raw" ? "preview" : "raw";
        }
        if (this.currentView === "preview") this.showChapterPreview();
        else this.showRawChapterText();
        previewSwitch
            .siblings("span")
            .text(this.currentView === "preview" ? "Preview" : "Raw");
    }

    /**
     * @param {boolean | undefined} forcedValue
     */
    static toggleHTMLSanitize(forcedValue) {
        PluginWrapper.previewSettings.sanitize =
            forcedValue ?? !PluginWrapper.previewSettings.sanitize;
        currentWrapper().refreshPreview();
        $("#sanitize-preview-html")
            .siblings("span")
            .text(
                PluginWrapper.previewSettings.sanitize
                    ? "Sanitized HTML"
                    : "Unsanitized HTML"
            );
    }

    refreshPreview() {
        this.toggleChapterView(true);
    }

    async fetchImage() {
        const url = $("#fetchImage input").val();
        const spinner = $("#fetchImage .spinner-border");
        spinner.show();
        try {
            const base64 = await (
                await fetchFromAPI(`/fetchImage/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        pluginRequirePath: this.requirePath,
                        url: url,
                    }),
                })
            ).text();
            $("#fetchImage img").attr("src", `data:image/jpg;base64,${base64}`);
        } catch (e) {
            console.error(e);
            if (e)
                $("#fetchImage").text(
                    `${typeof e === "object" && "message" in e ? e.message : e}`
                );
        } finally {
            spinner.hide();
        }
    }
}

$(".popularNovels-btn").on("click", () =>
    state.current_plugin?.getPopularNovels()
);

$(".searchNovels-btn").on("click", () =>
    state.current_plugin?.getSearchedNovels()
);

$(".parseNovelAndChapters-btn").on("click", () =>
    state.current_plugin?.getNovelAndChapters()
);

$(".parseChapter-btn").on("click", () => state.current_plugin?.getChapter());
$(".fetchImage-btn").on("click", () => state.current_plugin?.fetchImage());

/** @type {Record<string,string>} */
let lastCopiedHeaders = {};

const checkIfHeadersChanged = () => {
    const currentHeaders = getHeaders();

    const headers = new Set(Object.keys(currentHeaders));
    // quick exit if all custom headers removed
    if (headers.size <= 2) {
        $("#headersnotcopied").css({ display: "none" });
        return;
    }

    // get a list of all headers
    for (const headername of Object.keys(lastCopiedHeaders)) {
        headers.add(headername);
    }

    headers.delete("Cookie");
    headers.delete("User-Agent");

    let headersChanged = false;
    // check if they're all the same
    for (const headername of Array.from(headers)) {
        if (currentHeaders[headername] !== lastCopiedHeaders[headername])
            headersChanged = true;
    }

    if (headersChanged) $("#headersnotcopied").css({ display: "block" });
    else $("#headersnotcopied").css({ display: "none" });
};

// get all header inputs and check if headers changed after
$(".headerinfo > span[contenteditable='true']").each((_, inputElement) => {
    $(inputElement).on("input", checkIfHeadersChanged);
});

$("#addheaderbtn").on("click", () => {
    /**
     <div class="headerinfo" data-headername="Cookie">
        <span class="headername" onclick="this.nextElementSibling.nextElementSibling.focus()">Cookie</span><b>:&nbsp;</b>
        <span class="headervalue" contenteditable="true" ></span>
    </div>
     */
    const nameSpan = $("<span>").addClass("headername");
    const valueSpan = $("<span>").addClass("headervalue");
    const separator = $("<b>").html(":&nbsp;");
    const clearButton = $("<button>")
        .text("Clear")
        .addClass("headereditbutton")
        .on("click", () => {
            valueSpan.text("");
            checkIfHeadersChanged();
        });
    const removeButton = $("<button>")
        .text("Remove")
        .addClass("headereditbutton");
    nameSpan[0].contentEditable = "true";
    valueSpan[0].contentEditable = "true";
    nameSpan.on("input", checkIfHeadersChanged);
    valueSpan.on("input", checkIfHeadersChanged);
    const headerinfo = $("<div>")
        .append(nameSpan, separator, valueSpan, clearButton, removeButton)
        .attr("class", "headerinfo");
    removeButton.on("click", () => {
        headerinfo.remove();
        checkIfHeadersChanged();
    });
    $("#headerinfos").append(headerinfo);
});

$("#copyascode").on("click", async () => {
    const headers = getHeaders();
    const strippedHeaders = {
        ...headers,
    };
    delete strippedHeaders["Cookie"];
    delete strippedHeaders["User-Agent"];
    await navigator.clipboard.writeText(
        JSON.stringify(strippedHeaders, null, 4)
    );
    lastCopiedHeaders = headers;
    checkIfHeadersChanged();
    $("#headerscopied").css({ display: "block" });
    setTimeout(() => $("#headerscopied").css({ display: "none" }), 1000);
});

const currentWrapper = () => state.current_plugin || emptyPluginWrapper;

/**
 * @type {JQuery<HTMLInputElement>}
 */
const previewSwitch = $("#raw-preview-switch");
const emptyPluginWrapper = new PluginWrapper("");
previewSwitch.on("change", () => {
    currentWrapper().toggleChapterView();
});

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
    const width = $("#width-input");
    width[0].value = `${PluginWrapper.previewSettings.iframeSize.width}`;
    width.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.iframeSize.width = parseFloat(value);
        currentWrapper().refreshPreview();
    });

    /** @type {JQuery<HTMLInputElement>} */
    const height = $("#height-input");
    height[0].value = `${PluginWrapper.previewSettings.iframeSize.height}`;
    height.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.iframeSize.height = parseFloat(value);
        currentWrapper().refreshPreview();
    });

    $("#swap-iframe-size")
        .off("click")
        .on("click", () => {
            const { width, height } = PluginWrapper.previewSettings.iframeSize;
            setPreviewSize(height, width);
        });

    $("#load-preset-size")
        .off("click")
        .on("click", () => {
            /** @type {JQuery<HTMLSelectElement>} */
            const select = $("#size-preset");
            const [wStr, hStr] = select[0].value.split(",");
            if (wStr && hStr && parseInt(wStr) && parseInt(hStr))
                setPreviewSize(parseInt(wStr), parseInt(hStr));
        });

    /** @type {JQuery<HTMLInputElement>}*/
    const shouldSanitizeHTML = $("#sanitize-preview-html");
    PluginWrapper.toggleHTMLSanitize(shouldSanitizeHTML[0].checked);
    shouldSanitizeHTML.off("click").on("click", ({ target: { checked } }) => {
        PluginWrapper.toggleHTMLSanitize(checked);
    });

    /** @type {JQuery<HTMLInputElement>} */
    const lineHeight = $("#lh-input");
    lineHeight[0].value = `${PluginWrapper.previewSettings.readerSettings.lineHeight}`;
    lineHeight.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.readerSettings.lineHeight =
            parseFloat(value);
        currentWrapper().refreshPreview();
    });

    /** @type {JQuery<HTMLInputElement>} */
    const backgroundColor = $("#bgc-input");
    backgroundColor[0].value = `${PluginWrapper.previewSettings.readerSettings.theme}`;
    backgroundColor.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.readerSettings.theme = value;
        currentWrapper().refreshPreview();
    });

    /** @type {JQuery<HTMLInputElement>} */
    const textColor = $("#txt-input");
    textColor[0].value = `${PluginWrapper.previewSettings.readerSettings.textColor}`;
    textColor.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.readerSettings.textColor = value;
        currentWrapper().refreshPreview();
    });

    /** @type {JQuery<HTMLInputElement>} */
    const fontSize = $("#fs-input");
    fontSize[0].value = `${PluginWrapper.previewSettings.readerSettings.textSize}`;
    fontSize.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.readerSettings.textSize =
            parseFloat(value);
        currentWrapper().refreshPreview();
    });

    /** @type {JQuery<HTMLSelectElement>} */
    const textAlign = $("#ta-input");
    textAlign.off("change").on("change", ({ target: { selectedOptions } }) => {
        PluginWrapper.previewSettings.readerSettings.textAlign =
            selectedOptions[0].value;
        currentWrapper().refreshPreview();
    });

    /** @type {JQuery<HTMLTextAreaElement>} */
    const customCSS = $("#css-ta");
    customCSS[0].value = PluginWrapper.previewSettings.customCSS;
    customCSS.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.customCSS = value;
        currentWrapper().refreshPreview();
    });

    /** @type {JQuery<HTMLTextAreaElement>} */
    const customJS = $("#js-ta");
    customJS[0].value = PluginWrapper.previewSettings.customJS;
    customJS.off("change").on("change", ({ target: { value } }) => {
        PluginWrapper.previewSettings.customJS = value;
        currentWrapper().refreshPreview();
    });
};

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
        fetchFromAPI("static/html/template.html")
            .then((r) => r.text())
            .then((t) => {
                PluginWrapper.previewSettings.htmlTemplate = t;
            }),
        fetchFromAPI(
            "https://raw.githubusercontent.com/LNReader/lnreader/plugins/android/app/src/main/assets/css/index.css"
        )
            .then((r) => r.text())
            .then((t) => (PluginWrapper.previewSettings.fillCSS = t)),
        fetchFromAPI(
            "https://raw.githubusercontent.com/LNReader/lnreader/plugins/android/app/src/main/assets/js/index.js"
        )
            .then((r) => r.text())
            .then((t) => (PluginWrapper.previewSettings.fillJS = t)),
    ]).then(() => {
        emptyPluginWrapper.refreshPreview();
    });
    for (const key in window.themes) {
        const t = window.themes[key];
        const picker = $("#theme-picker");
        picker.append(
            $("<div>")
                .text(PluginWrapper.previewSettings.theme === t ? "✓" : "A")
                .addClass("theme")
                .css({
                    "background-color": t.backgroundColor,
                    color: t.textColor,
                })
                .attr("id", key)
                .on("click", (x) => {
                    loadThemePreset(t);
                    refreshPreviewSettings();
                    currentWrapper().refreshPreview();
                    $("#theme-picker .theme").each((e, el) => {
                        el.innerText = el.id === key ? "✓" : "A";
                    });
                })
        );
    }
    refreshPreviewSettings();
    lastCopiedHeaders = getHeaders();
    checkIfHeadersChanged();
});
