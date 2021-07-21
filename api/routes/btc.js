// @ts-check
const express = require("express");
const db = require("../libs/db.js");
const router = express.Router();

const StartTime = parseInt(process.env.StartTime) || (Date.now() + 10 * 1000);
const preSendTime = parseInt(process.env.preSendTime) || 2 * 1000;
const ContestLength = parseInt(process.env.ContestLength) || 10 * 1000;
const SessionTimeout = parseInt(process.env.SessionTimeout) || 10 * 1000;

// get the status of the contest
router.get("/", async (req, res, next) => {
    let fail = false;
    if (Date.now() < StartTime - preSendTime) {
        res.status(200).json({
            status: "awaiting",
            start: StartTime,
            length: ContestLength,
        });
        return;
    }
    if (Date.now() >= StartTime + ContestLength) {
        res.status(200).json({
            status: "ended",
            start: StartTime,
            length: ContestLength,
        });
    }
    /**
     * @typedef {{
     *      question: string,
     *      image: string,
     *      answer: string
     * }
     * } question
     *
     */
    /**
     * @type {void | {questions: question[]}}
     */
    let qp=null;
    if (req.cookies.sessionID !== undefined) {
        let verified = (await db.VerifySession(req.cookies.sessionID).catch((err) => {
            res.status(500).json({
                status: "error",
                message: "We are sorry, but our servers are facings some issues! If this issue persists, please report this to pihacks@presidency.ac.bd " + err,
            });
            fail = true;
        }));
        if (fail) return;

        if (verified != null) {
            qp = (await db.getQP().catch((err) => {
                res.status(500).json({
                    status: "error",
                    message: "We are sorry, but our servers are facings some issues! If this issue persists, please report this to pihacks@presidency.ac.bd " + err,
                });
                fail = true;
            }));
            if (fail) return;
        }
    }

    if (Date.now() < StartTime) {
        res.status(200).json({
            status: "presend",
            start: StartTime,
            length: ContestLength,
            qp: qp
        });
        return;
    }
    if (Date.now() < StartTime + ContestLength) {
        res.status(200).json({
            status: "running",
            start: StartTime,
            length: ContestLength,
            qp: qp
        });
        return;
    }
});

/**
 * @param  {String} s
 * @returns {Boolean}
 */
function ValidateTxt(s) {
    if (s.length > 200) return false;

    for (let i = 0; i < s.length; i++) {
        if (
            s[i] == '.' ||
            s[i] == '#' ||
            s[i] == '$' ||
            s[i] == '[' ||
            s[i] == ']' ||
            s[i] == '"' ||
            s[i] == "'"
        ) return false;
    }
    return true;
}

//login users
router.post("/", async (req, res, next) => {
    /**
     * @type {{
     *      uid:string,
     *      pass:string
     * }}
     */
    let Inpt = {
        uid: String(req.body.uid),
        pass: String(req.body.pass),
    };
    let fail = false;
    //validations
    if (!ValidateTxt(Inpt.uid) || Inpt.uid == "") {
        res.status(400).json({
            status: "invalid",
            message: "input contains invalid characters"
        });
        return;
    }
    /**
     * @type {{
    *              uid: string,
    *              pass: string,
    *              score: number,
    *              answers: string[],
    *              CurrentSesh:string,
    *               solved:boolean[]
    *          }}
     */
    let UserData = (await db.GetUserData(Inpt.uid).catch((err) => {
        res.status(500).json({
            status: "error",
            message: "We are sorry, but our servers are facings some issues! If this issue persists, please report this to pihacks@presidency.ac.bd " + err,
        });
        fail = true;
    }));
    if (fail) return;
    if (UserData == null) {
        res.status(400).json({
            status: "invaid",
            message: "the given user ID was not found"
        });
        return;
    }
    if (UserData.pass != Inpt.pass) {
        res.status(400).json({
            status: "invaid",
            message: "wrong password"
        });
        return;
    }
    let sessionID = (await db.UpdateUser(UserData, true).catch((err) => {
        res.status(500).json({
            status: "error",
            message: "We are sorry, but our servers are facings some issues! If this issue persists, please report this to pihacks@presidency.ac.bd " + err,
        });
        fail = true;
    }));
    if (fail) return;
    res.cookie("sessionID", sessionID,{
        maxAge: SessionTimeout,
        secure: true
    });
    res.status(200).json({
        status: "success",
        message: "logged in"
    });
    return;
});


//answer submission
router.patch("/:ques", async (req, res, next) => {
    let fail = false, verified = null;
    if (Date.now() >= StartTime + ContestLength){
        res.status(400).json({
            status:"Invalid",
            message:"invalid request, contest ended"
        })
        return;
    }
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
    if (verified == null){
        res.status(401).json({
            status:"invalid",
            message:"the user is not logged in"
        })
        return;
    }
    let Inpt = {
        quesindex: parseInt(req.params.ques),
        answer: String(req.body.answer)
    };
    if(Inpt.quesindex===NaN) {
        res.status(400).json({
            status:"invalid",
            message:"question index not valid"
        })
    }
    var isCorrect = (await db.verifyAnswer(Inpt.quesindex, Inpt.answer).catch((err) => {
        res.status(500).json({
            status: "error",
            message: "We are sorry, but our servers are facings some issues! If this issue persists, please report this to pihacks@presidency.ac.bd " + err,
        });
        fail = true;
    }));
    if (fail) return;
    
    
    /**
     * @type {?{
 *              uid: string,
 *              pass: string,
 *              score: number,
 *              answers: string[],
 *              CurrentSesh:string,
 *              solved:boolean[]
 *          }}
     */
    // @ts-ignore
    let UserData = (await db.GetUserData(verified).catch((err) => {
        res.status(500).json({
            status: "error",
            message: "We are sorry, but our servers are facings some issues! If this issue persists, please report this to pihacks@presidency.ac.bd " + err,
        });
        fail = true;
    }));
    if (fail) return;
    if (UserData == null) {
        res.status(400).json({
            status: "invaid",
            message: "the given user ID was not found"
        });
        return;
    }
    
    UserData.answers[Inpt.quesindex] = Inpt.answer;
    
    if(UserData.solved[Inpt.quesindex] && !isCorrect){
        UserData.score--;
    }
    else if (!UserData.solved[Inpt.quesindex] && isCorrect){
        UserData.score++;
    }
    // @ts-ignore
    UserData.solved[Inpt.quesindex]=isCorrect;

    await db.UpdateUser(UserData);
    res.status(200).json({
        status:"success",
        message:"Answer submitted successfully"
    })
});

module.exports = router;