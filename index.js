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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
