import { load as parseHTML } from "cheerio";
import { fetchApi, fetchFile } from "@libs/fetch";
import { FilterTypes, Filters } from "@libs/filterInputs";
import { Plugin } from "@typings/plugin";

class FTest implements Plugin.PluginBase {
    id = "ftest";
    name = "Filter Test";
    icon = "src/en/noblemtl/icon.png";
    site = "https://noblemtl.com/";
    version = "1.0.0";
    userAgent = "";
    cookieString = "";
    async popularNovels(
        pageNo: number,
        { filters }: Plugin.PopularNovelsOptions<typeof this.filters>
    ): Promise<Plugin.NovelItem[]> {
        return [];
    }

    async parseNovelAndChapters(novelUrl: string): Promise<Plugin.SourceNovel> {
        return { url: "" };
    }
    async parseChapter(chapterUrl: string): Promise<string> {
        return "Empty chapter";
    }

    async searchNovels(
        searchTerm: string,
        pageNo?: number | undefined
    ): Promise<Plugin.NovelItem[]> {
        return [];
    }
    async fetchImage(url: string): Promise<string | undefined> {
        return await fetchFile(url);
    }

    filters = {
        picker: {
            type: FilterTypes.Picker,
            label: "Picker",
            options: [
                { label: "A", value: "a" },
                { label: "B", value: "b" },
            ],
            value: "a",
        },
        nd_picker: {
            type: FilterTypes.Picker,
            label: "ND_Picker",
            options: [
                { label: "A", value: "a" },
                { label: "B", value: "b" },
            ],
            value: "b",
        },
        checkbox: {
            type: FilterTypes.CheckboxGroup,
            label: "Checkbox",
            options: [
                { label: "A", value: "a" },
                { label: "B", value: "b" },
            ],
            value: [],
        },
        nd_checkbox: {
            type: FilterTypes.CheckboxGroup,
            label: "ND_Checkbox",
            options: [
                { label: "A", value: "a" },
                { label: "B", value: "b" },
            ],
            value: ["a"],
        },
        switch: {
            type: FilterTypes.Switch,
            label: "Switch",
            value: false,
        },
        nd_switch: {
            type: FilterTypes.Switch,
            label: "ND_Switch",
            value: true,
        },
        text: {
            type: FilterTypes.TextInput,
            label: "Text",
            value: "",
        },
        nd_text: {
            type: FilterTypes.TextInput,
            label: "ND_Text",
            value: "some default value",
        },
        xcheckbox: {
            type: FilterTypes.ExcludableCheckboxGroup,
            label: "XCheckbox",
            options: [
                { label: "A", value: "a" },
                { label: "C", value: "c" },
                { label: "B", value: "b" },
            ],
            value: {},
        },
        nd_xcheckbox: {
            type: FilterTypes.ExcludableCheckboxGroup,
            label: "ND_XCheckbox",
            options: [
                { label: "A", value: "a" },
                { label: "C", value: "c" },
                { label: "B", value: "b" },
            ],
            value: { exclude: ["a"], include: ["b"] },
        },
    } satisfies Filters;
}

const Test = new FTest();

export default new FTest();
