const fs = require("fs");
const config = require("./config.json");
const axios = require("axios");
const cheerio = require("cheerio");
const userAgent = require('user-agents');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const puppeteer = require("puppeteer-extra");

puppeteer.use(StealthPlugin())


const vis = {}

const ranks = [
    "<:johnohno:746441494289973310>",
    "<:skillgroup1:790415720244183060>",
    "<:skillgroup2:790415760673079327>",
    "<:skillgroup3:790415798140141588>",
    "<:skillgroup4:790415811558637628>",
    "<:skillgroup5:790415823973515294>",
    "<:skillgroup6:790415835705376829>",
    "<:skillgroup7:790415849655238696>",
    "<:skillgroup8:790415864558125086>",
    "<:skillgroup9:790415879636254730>",
    "<:skillgroup10:790415892701773854>",
    "<:skillgroup11:790415928830853171>",
    "<:skillgroup12:790415941204836374>",
    "<:skillgroup13:790416009638182933>",
    "<:skillgroup14:790416023853203506>",
    "<:skillgroup15:790416035035086879>",
    "<:skillgroup16:790416047139717120>",
    "<:skillgroup17:790416058112147526>",
    "<:skillgroup18:790416078991654972>"
]

const stacks = [
    ":blue_square:",
    ":green_square:",
    ":red_square:",
    ":orange_square:"
]

async function fetchLiveData(browser, id) {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0); 
    await page.setUserAgent(userAgent.toString())
    await page.goto(`${config.base}/${id}/live`);
    const resp = await page.content();
    const json = JSON.parse(resp.slice(84, -20))
    await page.close();
    if(!json["map"]) return false;
    else return cheerio.load(`<div>${json["content"].replace(/&lt;/g,"<").replace(/&gt;/g,">")}</div>`);
}

async function fetchHighestRank(browser, id) {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0); 
    await page.setUserAgent(userAgent.toString())
    await page.goto(`${config.base}/${id}`);
    const resp = await page.content();
    page.close()
    const $ = cheerio.load(resp);
    const rankBox = $(`[style*="float:right; width:92px; height:120px; padding-top:56px; margin-left:32px"]`);
    const img = $(rankBox).find("img").toArray()[1];
    const src = $(img).attr("src");
    if(src == undefined) return false;

    let rank = Number(src.slice(41,-4));
    return rank;
}

async function parseData(browser, $) {
    let id2 = "";

    let queueIDS = {};
    let topPlayers = $(".match-player").toArray();
    let groupUpdated = true;
    let groupID = 0;
    let soloID = 19;
    topPlayers.forEach((player, i) => {
        let friendLink = $(player).find(".friends-link").toArray();
        if(friendLink.length == 0) {
            queueIDS[$(player).attr("title")] = soloID--;
            if(!groupUpdated) {
                groupUpdated = true;
                groupID++;
            }
        }
        else {
            queueIDS[$(topPlayers[i - 1]).attr("title")] = groupID;
            queueIDS[$(player).attr("title")] = groupID;
            groupUpdated = false;
        }
    });

    let bodies = $("table.scoreboard>tbody").toArray();
    let names = [];
    let ranks2 = [[],[]];
    bodies.splice(1,1);

    return [(await Promise.all(bodies.map(async (tbody, i) => {
        let rows = $(tbody).find("tr").toArray();
        let sum = 0;
        let tot = 0;
        return [(await Promise.all(rows.map(async row => {
            let tds = $(row).find("td").toArray();
            let url = $(tds[0]).find("a").attr("href");
            let id = url.slice(8);
            let td3 = $(tds[2]).html();
            let name = $(tds[0]).find("span").text();
            let identifier = !config.players[id] ? name : `**${config.players[id]}**`;
            let rank = Number(td3.slice(51,-18)); 
            let highestRank = await fetchHighestRank(browser, id)
            ranks2[i].push([rank, highestRank ? highestRank : rank]);

            names.push(name);
            sum += rank;

            if(rank > 0) tot++;
            return [identifier, rank, queueIDS[name]];
        }))).sort((i, j) => i[1] - j[1]).reverse().map(row => {return `${row[2] < 10 ? stacks[row[2]] : ":black_large_square:"} ${row[0]}`}), ranks[Math.round(sum / tot)]];
    }))), names.sort().join(""), queueIDS, [ranks2[0].sort((x,y)=>x[0] - y[0]).reverse().map(x => x.map(y => ranks[y])),ranks2[1].sort((x,y)=>x[0] - y[0]).reverse().map(x => x.map(y => ranks[y]))], $($('[style*="font-weight:500"]').toArray()[0]).text()];
}

async function sendWebhook(embed) {
    await axios.post(config.webhook, {
        embeds: [embed],
        avatar_url: "https://i.imgur.com/FDHobOs.jpg"
    })
}

async function refresh(browser) {
    for(const id in config.players) {
        const doc = await fetchLiveData(browser, id);
        if(!doc) continue;
        
        let matchData = await parseData(browser, doc);
        if(vis[matchData[1]]) {
            continue;
        }
        vis[matchData[1]] = true;
        await sendWebhook({
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: `Team 1 (average ${matchData[0][0][1]})`,
                    value: matchData[0][0][0].join("\n"),
                    inline: true
                },
                {
                    name: "Ranks",
                    value: matchData[3][0].map(x=>x[0]).join("\n"),
                    inline: true
                },
                {
                    name: "Highest Rank",
                    value: matchData[3][0].map(x=>x[1]).join("\n"),
                    inline: true
                },
                {
                    name: `Map`,
                    value: `${matchData[4]} ${matchData[4] == "de_nuke" ? "<:nook:783565651583303700>" : ":poop:"}`
                },
                {
                    name: `Team 2 (average ${matchData[0][1][1]})`,
                    value: matchData[0][1][0].join("\n"),
                    inline: true
                },
                {
                    name: "Ranks",
                    value: matchData[3][1].map(x=>x[0]).join("\n"),
                    inline: true
                },
                {
                    name: "Highest Rank",
                    value: matchData[3][1].map(x=>x[1]).join("\n"),
                    inline: true
                },
            ]
        });
        await sleep(1000 * 60 * 10); 
    }
}

async function sleep(ms) {
    return new Promise((res, rej) => {
        setTimeout(res, ms); 
    });
}

(async function() {
    const browser = await puppeteer.launch({});

    

    while(true) {
        await refresh(browser);
        console.log("Refreshed at " + new Date());
        if(new Date().getHours() == 2) await sleep(1000*60*60*7);
        await sleep(5000);
    }

    await browser.close();

})();