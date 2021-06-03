const express = require("express");
const sources = require("./sources");

const app = express();

app.use(
    express.json({
        extended: false,
    })
);

app.get("/", (req, res) =>
    res.json({
        Author: "@rajarsheechatterjee",
        Version: "1.0.0",
        Github: "https://github.com/rajarsheechatterjee/lnreader-extensions",
    })
);

// English
app.get("/api/", (req, res) => res.json(sources));
app.use("/api/1/", require("./src/en/boxnovel/BoxNovel"));
app.use("/api/2/", require("./src/en/readlightnovel/ReadLightNovel"));
app.use("/api/3/", require("./src/en/fastnovel/FastNovel"));
app.use("/api/4/", require("./src/en/readnovelfull/ReadNovelFull"));
app.use("/api/5/", require("./src/en/mtlnovel/MTLNovel"));
app.use("/api/6/", require("./src/en/novelhall/Novelhall"));
app.use("/api/7/", require("./src/en/wuxiaworld/WuxiaWorld"));
app.use("/api/8/", require("./src/en/novelfull/NovelFull"));
app.use("/api/9/", require("./src/en/noveltrench/NovelTrench"));
app.use("/api/10/", require("./src/en/vipnovel/VipNovel"));
app.use("/api/11/", require("./src/en/kisslightnovels/KissLightNovels"));
app.use("/api/12/", require("./src/en/wuxiaworldsite/WuxiaWorldSite"));
app.use("/api/13/", require("./src/en/freewebnovel/FreeWebNovel"));
app.use("/api/14/", require("./src/en/jpmtl/JPMTL"));
app.use("/api/15/", require("./src/en/lightnovelpub/LightNovelPub"));
app.use("/api/16/", require("./src/en/wuxiaworldco/WuxiaWorldCo"));
app.use("/api/17/", require("./src/en/tapread/TapRead"));
app.use("/api/18/", require("./src/en/novelupdatescc/NovelUpdatesCc"));
app.use("/api/19/", require("./src/en/readlightnovelcc/ReadLightNovelCc"));
app.use("/api/20/", require("./src/en/wuxiaworldcloud/WuxiaWorldCloud"));
app.use("/api/21/", require("./src/en/woopread/WoopRead"));
app.use("/api/22/", require("./src/en/foxaholic/Foxaholic"));
app.use("/api/27/", require("./src/en/comrademao/ComradeMao"));

// Spanish
app.use("/api/23/", require("./src/es/tunovelaligera/Tunovelaligera"));
app.use("/api/24/", require("./src/es/skynovels/Skynovels"));
app.use("/api/25/", require("./src/es/einherjarproject/EinherjarProject"));
app.use("/api/26/", require("./src/es/novelasligera/NovelasLigera"));
app.use("/api/28/", require("./src/es/yukitls/YuukiTls"));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
