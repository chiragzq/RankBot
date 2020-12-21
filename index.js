const fs = require("fs");
const config = require("./config.json");
const axios = require("axios");
const cheerio = require("cheerio");
const userAgent = require('user-agents');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const puppeteer = require("puppeteer-extra");

puppeteer.use(StealthPlugin())

const headers = {
    "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "accept-encoding":"gzip, deflate, br",
    "accept-language":"en-US,en;q=0.9",
    "sec-ch-ua":"\"Google Chrome\";v=\"87\", \" Not;A Brand\";v=\"99\", \"Chromium\";v=\"87\"",
    "sec-ch-ua-mobile":"?0",
    "sec-fetch-dest":"document",
    "sec-fetch-mode":"navigate",
    "sec-fetch-site":"none",
    "upgrade-insecure-requests":"1",
    "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36"
}

const ranks = [
    "Unranked",
    "Silver I",
    "Silver II",
    "Silver III",
    "Silver IV", 
    "Silver Elite",
    "Silver Elite Master",
    "Gold Nova I",
    "Gold Nova II",
    "Gold Nova III",
    "Gold Nova Master",
    "Master Guardian I",
    "Master Guardian II",
    "Master Guardian Elite",
    "Distinguished Master Guardian",
    "Legendary Eagle",
    "Legendary Eagle Master",
    "Supreme Master First Class",
    "Global Elite"
]

const vis = {}

async function fetchLiveData(browser, id) {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())
    await page.goto(`${config.base}/${id}/live`);
    const resp = await page.content();
    const json = JSON.parse(resp.slice(84, -20))
    page.close();
    if(!json["map"]) return false;
    else return cheerio.load(`<div>${json["content"].replace(/&lt;/g,"<").replace(/&gt;/g,">")}</div>`);
}

function parseData($) {
    let id2 = "";
    let bodies = $("table.scoreboard>tbody").toArray();
    bodies.splice(1,1);
    return [bodies.map(tbody => {
        let rows = $(tbody).find("tr").toArray();
        let sum = 0;
        let tot = 0;
        return [rows.map(row => {
            let tds = $(row).find("td").toArray();
            let url = $(tds[0]).find("a").attr("href");
            let id = url.slice(8);
            let td3 = $(tds[2]).html();
            let name = $(tds[0]).find("span").text();
            let identifier = !config.players[id] ? name : config.players[id];
            let rank = Number(td3.slice(51,52));

            id2 += id + rank
            sum += rank;
            if(rank > 0) tot++;
            return [identifier, rank];
        }).sort((i, j) => i[1] - j[1]).reverse().map(row => row[0] + ": " + ranks[row[1]]), ranks[Math.round(sum / tot)]];
    }), id2];
}

async function sendWebhook(embed) {
    console.log(embed);
    await axios.post(config.webhook, {
        embeds: [embed]
    })
}

async function refresh(browser) {
    for(const id in config.players) {
        const doc = await fetchLiveData(browser, id);
        if(!doc) continue;
        
        let matchData = parseData(doc);
        // console.log(matchData[0]);
        if(vis[matchData[1]]) {
            continue;
        }
        vis[matchData[1]] = true;
        // `Match found for ${config.players[id]}:\n\nTeam 1 (average ${matchData[0][0][1]})\n${matchData[0][0][0].join("\n")}\n\nTeam 2: (average ${matchData[0][1~][1]})\n${matchData[0][1][0].join("\n")}`
        await sendWebhook({
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: `Team 1 (average ${matchData[0][0][1]})`,
                    value: matchData[0][0][0].join("\n")
                },
                {
                    name: `Team 2 (average ${matchData[0][1][1]})`,
                    value: matchData[0][1][0].join("\n")
                }
            ]
        });
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
        await sleep(5000);
    }

    await browser.close();

})();