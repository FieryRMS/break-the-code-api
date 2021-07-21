
//@ts-check
const db = require("./db.js");

const WindowMs = parseInt(process.env.WindowMs);
const MaxReqs = parseInt(process.env.MaxReqs);
const BanPeriod = parseInt(process.env.BanPeriod);
const MaxWarns = parseInt(process.env.MaxWarns);
const MaxOffences = parseInt(process.env.MaxOffences);
const SpamIncrement = parseInt(process.env.SpamIncrement);
const SpamIncrementOffence = parseInt(process.env.SpamIncrementOffence);
const SendBanHeaders = parseInt(process.env.SendBanHeaders);

/**
 * 
 * @param {"warn" | "timeout" | "permban"} type
 *  * @param {string=} time
 * @returns {string} 
 */
function BanMessages(type, time = "") {
    switch (type) {
        case "warn":
            return "Hey!, seems like you have been sending too many requests!\n" +
                "We understand you might be excited about the event " +
                "but keep in mind we need to process a lot of requests from other participants too, " +
                "please wait until " + time + " before sending another request. " +
                "if you think this was a mistake, feel free to contact us at pihacks@presidency.ac.bd";

        case "timeout":
            return "Hey!, seems like you have been sending too many requests!\n" +
                "After repeated offences, our systems have put you in a timeout corner until " + time +
                ", if you think this was a mistake, feel free to contact us at pihacks@presidency.ac.bd";

        case "permban":
            return "Welp! Looks like you got perma banned by our systems" +
                ", if you think this was a mistake, feel free to contact us at pihacks@presidency.ac.bd";
        default:
            return "Error: BanHandler";
    }
}




/**
 * @param  {import ("express").Request} req
 * @param  {import ("express").Response} res
 * @param  {import ("express").NextFunction} next
 */
async function BanHandler(req, res, next) {
    //init
    let fail = false;
    let verified = null;
    if (req.cookies.sessionID !== undefined) {
        verified = (await db.VerifySession(req.cookies.sessionID).catch((err) => {
            res.status(500).json({
                status: "error",
                message: "We are sorry, but our servers are facings some issues! If this issue persists, please report this to pihacks@presidency.ac.bd " + err,
            });
            fail = true;
        }));
        if (fail) return;
    }
    if (verified ==null){
        next();
        return;
    }
    var ip = verified || "null";
    /**
     * @type {?{
     *      uids: string[], 
     *      start: number, 
     *      ReqsLeft: number,
     *      WarningsLeft: number,
     *      offences: number,
     *      timedout: boolean
     * }}
     */
    let BanStatus = db.GetBanStatus(ip);
    if (BanStatus == null) {
        BanStatus = {
            uids: [],
            start: Date.now(),
            ReqsLeft: MaxReqs,
            WarningsLeft: MaxWarns,
            offences: 0,
            timedout: false
        };
    }

    /**
     * @type {{
     *      status: string, 
     *      message: string,
     * }}
     */
    let response;


    //If maximum offences reached, permaban
    if (BanStatus.offences >= MaxOffences) {
        response = {
            status: "Too Many Requests",
            message: BanMessages("permban"),
        };
        if (SendBanHeaders) res.set(BanStatus);
        res.status(429).json(response);
        return;
    }

    //if timedout, check if timeout is still in progress, else unban
    if (BanStatus.timedout) {
        if (Date.now() - BanStatus.start < BanPeriod) {
            let UnBanTime = (new Date(BanStatus.start + BanPeriod))
            .toLocaleString("en-US", { timeZone: 'Asia/Almaty' });
            response = {
                status: "Too Many Requests",
                message: BanMessages("timeout", UnBanTime),
            };
            if (SendBanHeaders) res.set(BanStatus);
            res.status(429).json(response);
            return;
        }
        else {
            BanStatus.timedout = false;
            BanStatus.start = Date.now();
            BanStatus.ReqsLeft = MaxReqs;
            BanStatus.WarningsLeft = 0;
        }
    }

    //refill allocated requests after window time ends
    if (Date.now() - BanStatus.start >= WindowMs) {
        BanStatus.ReqsLeft = MaxReqs;
        BanStatus.start = Date.now();
    }

    //decrease remaining requests and update db
    if (BanStatus.ReqsLeft > 0) {
        BanStatus.ReqsLeft--;
    }
    else if (BanStatus.ReqsLeft == 0) {
        BanStatus.ReqsLeft--; //so that it doesnt enter this function again later
        BanStatus.WarningsLeft--;
    }

    //no more warning, you get permaban or tempban
    if(BanStatus.WarningsLeft < 0){
        BanStatus.offences++;
        //perma ban if I am too offended
        if(BanStatus.offences>=MaxOffences){
            response ={
                status: "Too Many Requests",
                message: BanMessages("permban"),
            }
            if (SendBanHeaders) res.set(BanStatus);
            res.status(429).json(response);
            db.UpdateBanStatus(ip,BanStatus);
            return;
        }

        //not offended? then temp ban
        let UnBanTime = (new Date(BanStatus.start + BanPeriod))
        .toLocaleString("en-US", { timeZone: 'Asia/Almaty' });
        response = {
            status: "Too Many Requests",
            message: BanMessages("timeout", UnBanTime),
        };
        if (SendBanHeaders) res.set(BanStatus);
        res.status(429).json(response);
        db.UpdateBanStatus(ip, BanStatus);
        return;
    }
    //no reqs left, so warn
    if(BanStatus.ReqsLeft < 0){
        //stop annoying me, or else I'll get offended
        BanStatus.start+=SpamIncrement;
        BanStatus.offences+=(1/SpamIncrementOffence);

        let UnBanTime = (new Date(BanStatus.start + WindowMs))
            .toLocaleString("en-US", { timeZone: 'Asia/Almaty' });
        response = {
            status: "Too many Requests",
            message: BanMessages("warn", UnBanTime),
        }
        if (SendBanHeaders) res.set(BanStatus);
        res.status(429).json(response);
        db.UpdateBanStatus(ip, BanStatus);
        return;
    }

    if (SendBanHeaders) res.set(BanStatus);
    db.UpdateBanStatus(ip, BanStatus);
    next();
}

module.exports = BanHandler;