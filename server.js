const express = require("express");

const extensions = require("./src/extensions");

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

app.get("/api/", (req, res) => res.json(extensions));

// Box Novel
app.use("/api/1/", require("./src/en/boxnovel/boxnovel"));

// ReadLightNovel
app.use("/api/2/", require("./src/en/readlightnovel/readlightnovel"));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
