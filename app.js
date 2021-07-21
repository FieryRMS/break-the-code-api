//@ts-check
const express = require("express");
const app = express();
const BanHandler = require("./api/libs/BanHandler.js");
const btc = require("./api/routes/btc.js");
const CookieParser = require("cookie-parser");
app.use(express.json());
app.use(CookieParser());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    if (req.method === 'OPTIONS') {
        res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
        res.status(200).json({});
        return;
    }
    next();
});


app.enable('trust proxy');
app.use(BanHandler);

app.use("/btc", btc);

app.use("/", (req, res, next) => {
    res.status(200).send("NERRDDDD");
});


module.exports = app;