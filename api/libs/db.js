// @ts-check

//Initalize
const events = require("events");
const EventEmitter = new events.EventEmitter();
const firebase = require("firebase/app").default;
require("firebase/database");

let firebaseConfig = {
    apiKey: process.env.apiKey,
    authDomain: process.env.authDomain,
    databaseURL: process.env.databaseURL,
    projectId: process.env.projectId,
    storageBucket: process.env.projectId,
    messagingSenderId: process.env.messagingSenderId,
    appId: process.env.appId,
    measurementId: process.env.measurementId
};
let BTCBasePath = process.env.BTCBasePath;

firebase.initializeApp(firebaseConfig);
var database = firebase.database();
database.ref(BTCBasePath + "/").on("value", () => { });

const SessionTimeout = parseInt(process.env.SessionTimeout) || 10 * 1000;


var RateLimitDB = {};
var DBUpdated = true;
database.ref(BTCBasePath + "/rate-limit").on("value", (dat) => {
    RateLimitDB = dat.val();
    if (RateLimitDB == null) RateLimitDB = {};
});

const RateLimitUpdateInterval = parseInt(process.env.RateLimitUpdateInterval);
setInterval(() => {
    if (DBUpdated)
        database.ref(BTCBasePath + "/rate-limit").set(RateLimitDB)
            .catch((err) => {
                console.log(err);
            });
    DBUpdated = true;
}, RateLimitUpdateInterval);
process.once("SIGTERM", () => {
    if (DBUpdated)
        database.ref(BTCBasePath + "/rate-limit").set(RateLimitDB)
            .then(() => {
                EventEmitter.emit("StartShutdown");
            })
            .catch((err) => {
                console.log(err);
            });
    DBUpdated = true;
});

const dbTimeOut = parseInt(process.env.dbTimeOut);




//Methods

/**
 * @typedef {{
 *      question: string,
 *      image: string,
 *      answer: string
 * }} question
 * 
 */
/**
 * @returns {Promise<?{
 *              questions: question[]
 *          }>
 * }
 */
function getQP() {
    return new Promise((resolve, reject) => {
        var done = false;
        database.ref(BTCBasePath + "/QP").once("value", (dat) => {
            if (!done) {
                done = true;
                resolve(dat.val());
            }
        });
        setTimeout(() => {
            if (!done) {
                done = true;
                reject("Error: DATABASE CON DENIED");
            }
        }, dbTimeOut);
    });
}

/**
 * 
 * @param {number} index 
 * @param {string} answer 
 * @returns {Promise<boolean>}
 */
function verifyAnswer(index, answer){
    return new Promise((resolve, reject) => {
        var done = false;
        database.ref(BTCBasePath + "/QP" + "/questions/" + index).once("value", (dat) => {
            if (!done) {
                done = true;
                if(dat.val()==null) { 
                    reject("Error: NO SUCH QUESTION");
                    return;
                }
                if(dat.val().answer == answer) {
                    resolve(true);
                }
                else resolve(false);
            }
        });
        setTimeout(() => {
            if (!done) {
                done = true;
                reject("Error: DATABASE CON DENIED");
            }
        }, dbTimeOut);
    });
}

/**
 * @param {string} uid
 * @returns {Promise<?{
 *              uid: string,
 *              pass: string,
 *              score: number,
 *              answers: string[],
 *              CurrentSesh:string,
 *              solved:boolean[]
 *          }>
 * }
 */
function GetUserData(uid) {
    return new Promise((resolve, reject) => {
        var done = false;
        database.ref(BTCBasePath + "/users/" + uid).once("value", (dat) => {
            if (!done) {
                done = true;
                resolve(dat.val());
            }
        });
        setTimeout(() => {
            if (!done) {
                done = true;
                reject("Error: DATABASE CON DENIED");
            }
        }, dbTimeOut);
    });
}


/**
 * 
 * @param {!{
 *              uid: string,
 *              pass: string,
 *              score: number,
 *              answers: string[],
 *              CurrentSesh:string,
 *              solved:boolean[]
 *          }} UserData
 * @param {boolean} NewSesh
 * @returns {Promise<string>}
 */
function UpdateUser(UserData, NewSesh = false) {
    return new Promise(async (resolve, reject) => {
        if (NewSesh) {
            database.ref(BTCBasePath + "/sessions/" + UserData.CurrentSesh).remove();
            UserData.CurrentSesh = database.ref(BTCBasePath + "/sessions").push({
                uid: UserData.uid,
                start: Date.now()
            }).key;
        }
        var done = false;
        database.ref(BTCBasePath + "/users/" + UserData.uid).set(UserData)
            .then(() => {
                done = true;
                resolve(UserData.CurrentSesh);
            })
            .catch((err) => {
                done = true;
                reject(err);
            });
        setTimeout(() => {
            if (!done) {
                reject("Error: DATABASE CON DENIED");
            }
        }, dbTimeOut);
    });
}
/**
 * 
 * @param {string} sesh 
 * @returns {Promise<?string>}
 */
function VerifySession(sesh) {
    return new Promise((resolve, reject) => {
        if(sesh == "") resolve(null);
        var done = false;
        database.ref(BTCBasePath + "/sessions/" + sesh).once("value", (dat) => {
            if (!done) {
                done = true;
                if (dat.val() == null || Date.now() - dat.val().start >= SessionTimeout) {
                    resolve(null);
                }
                else {
                    resolve(dat.val().uid);
                }
            }
        });
        setTimeout(() => {
            if (!done) {
                done = true;
                reject("Error: DATABASE CON DENIED");
            }
        }, dbTimeOut);
    });
}


/**
 * 
 * @param {string} ip 
 * @param {boolean} reverse 
 * @returns {string}
 */
function ReplaceInvalidChar(ip, reverse = false) {
    //  ".", "#", "$", "[", or "]"
    if (typeof String.prototype.replaceAll == "undefined") {
        String.prototype.replaceAll = function (search, replace) { return this.split(search).join(replace); };
    }
    if (!reverse) {
        return String(ip)
            .replaceAll(".", ",")
            .replaceAll("#", "@")
            .replaceAll("$", "%")
            .replaceAll("[", "^")
            .replaceAll("]", "&");
    }
    else {
        return String(ip)
            .replaceAll(",", ".")
            .replaceAll("@", "#")
            .replaceAll("%", "$")
            .replaceAll("^", "[")
            .replaceAll("&", "]");
    }
}

/**
 * 
 * @param {string} ip 
 * @returns {?{
     *      uids: string[],
     *      start: number,
     *      ReqsLeft: number,
     *      WarningsLeft: number,
     *      offences: number,
     *      timedout: boolean
     * }}
 */
function GetBanStatus(ip) {
    ip = ReplaceInvalidChar(ip);
    return RateLimitDB[ip];
}

/**
 * 
 * @param {string} ip 
 * @param {{
     *      uids: string[],
     *      start: number,
     *      ReqsLeft: number,
     *      WarningsLeft: number,
     *      offences: number,
     *      timedout: boolean
     * }} BanStatus
 */
function UpdateBanStatus(ip, BanStatus) {
    ip = ReplaceInvalidChar(ip);
    RateLimitDB[ip] = BanStatus;
    DBUpdated = false;
}

/**
 * 
 * @param {string} ip 
 * @param {string} uid 
 */

module.exports = {
    getQP,
    verifyAnswer,
    GetUserData,
    UpdateUser,
    VerifySession,
    GetBanStatus,
    UpdateBanStatus,
    EventEmitter
};


// /**
//  * @type {{uid:string, score:number, solved:boolean[]}}
//  */
// let tempuid = {
//     uid: "nzhtsux",
//     score: 0,
//     solved: [false]
// };
// database.ref(EasterEggBasePath + "/users/" + tempuid.uid).set(tempuid);


// /**
//  * @type {?{index:number,message:string,image:?string,RelatedTo:?string}}
//  */
// let tempclue = {
//     index:0,
//     message:"Never gonna give you up",
//     image:"../assets/nerver.jpg",
//     RelatedTo : null
// };
// database.ref(EasterEggBasePath + "/clues/" + "test-clue").set(tempclue);


// /**
//  * @type {?{index:number,message:string,image:?string,RelatedTo:?string}}
//  */
// let tempcluerel = {
//     index: 1,
//     message: "din khaw",
//     image: "../assets/egg symbol.png",
//     RelatedTo: "test-clue"
// };
// database.ref(EasterEggBasePath + "/clues/" + "test-clue-related").set(tempcluerel);

