/*
Standalone script that sends a mail to current ticket holders of today's shows
 */
import {getTicketCoPage} from "./browser.js"
import {addEntry, createTables, selectEntry} from "./sqlite.js"
import fs from "node:fs"
import path from "node:path"
import {configDotenv} from "dotenv";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * @param forDayTimeShows if this routine should check and mail for daytime or nighttime shows
 */
async function checkMailVibes(forDayTimeShows: boolean) {
    configDotenv()
    await createTables()
    const page = await getTicketCoPage()

    await page.goto("https://ticketco.events/no/nb/admin/events/entities/")
    console.log("Navigating to event overview...")

    const shows = await page.$$(".tc-table--row")
    const todaysShows: string[] = []
    for await (const show of shows) {
        await show.$eval(".tc-table--cell__left:has(#manage)", (element) => {
            const showTime = element.innerHTML!.split("<br>")[1]

            const months = {
                "januar": 0, "februar": 1, "mars": 2, "april": 3,
                "mai": 4, "juni": 5, "juli": 6, "august": 7,
                "september": 8, "oktober": 9, "november": 10, "desember": 11
            }

            const match = showTime.match(/[\wæøå]+, {1,2}(\d{1,2})\. (\w+) (\d{4}), (\d{2}:\d{2}) \w{3,4} — [\wæøå]+, {1,2}(\d{1,2})\. (\w+) (\d{4}), (\d{2}:\d{2}) \w+/)
            if (!match) {
                throw new Error(`Invalid date format regex on ${showTime}...`)
            }

            const day1 = match[1]
            const month1 = match[2]
            const year1 = match[3]
            const time1 = match[4].split(":").map(n => Number(n))
            const day2 = match[5]
            const month2 = match[6]
            const year2 = match[7]
            const time2 = match[8].split(":").map(n => Number(n))

            // @ts-ignore
            const jsMonth1 = months[month1.toLowerCase()]
            // @ts-ignore
            const jsMonth2 = months[month2.toLowerCase()]

            if (!jsMonth1 || !jsMonth2) {
                throw new Error("Unknown month name " + jsMonth1 + " " + jsMonth2)
            }

            const dateTime1 = new Date(Number(year1), jsMonth1, Number(day1), time1[0], time1[1])
            const dateTime2 = new Date(Number(year2), jsMonth2, Number(day2), time2[0], time2[1])

            const showInfoEl = element.querySelector("#manage")!
            const showTicketCoID = showInfoEl.getAttribute("href")!.split("/")[6]
            const showName = showInfoEl.textContent!

            return JSON.stringify({dateStart: dateTime1, dateEnd: dateTime2, showName: showName, id: showTicketCoID}) // TODO this removes time info :(
        })
            .then(info => JSON.parse(info, (key, value) => {
                if (key === "dateStart" || key === "dateEnd") {
                    return new Date(value)
                } else return value
            }))
            .then(info => {
                if (isValidForMailSend(info, forDayTimeShows)) {
                    const id = info.id
                    selectEntry("TicketHolderMailSent", `ShowID="${id}"`).then(result => {
                        if (!result) {
                            // Uh oh, time to send a mail :^)
                            console.log(`Show "${info.showName}"(${id}) is today and seemingly a valid show, adding to mailing list`)
                            todaysShows.push(id)
                        } else console.log(`Already sent mail to "${info.showName}"(${id})`)
                    })
                }
            })
    }

    console.log("Checking if any mails are to be sent? ")

    if (todaysShows.length === 0) {
        console.log("No shows to mail! Exiting...")
        process.exit()
    }

    for await (const id of todaysShows) {
        console.log(`Retrieving necessary info to send a mail to (${id})`)
        await page.goto(`https://ticketco.events/no/nb/admin/events/entities/${id}/contact_attendees`)
            .then(async () => {
                const showName = await page.$eval(".breadcrumb", (el, id) => el.querySelector(`a[href="/no/nb/admin/events/entities/${id}/edit"]`)?.textContent, id)
                const ticketsSold = await page.$eval(".well", (el) => el.textContent!.match(/Du har nå solgt (\d+).+/)![1])
                if (!showName) {
                    throw new Error("No show name found.")
                }
                const subject = "Velkommen til kveldens forestilling"
                console.log("Necessary info found. Building mail on website and sending!")
                return page.type("#message_for_attendee_subject", subject)
                    .then(() => {
                        const body = fetchMailBody(forDayTimeShows, Number(ticketsSold), showName, todaysShows.length > 1)
                        // Using innerHTML so that we can use html tags in the mail template
                        return page.$eval(".fr-element", (el, body) => el.innerHTML = "<p>" + body + "</p>", body)
                    })
            })
        await page.click("button[type=submit]")
        await sleep(1500)

        addEntry("TicketHolderMailSent", id)
            .then(() => console.log("Mail sent and added to database"))
    }

    console.log("Done with mail duty...")
}

type Show = {
    dateStart: Date,
    dateEnd: Date,
    showName: string,
    id: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fetchMailBody(daytime: boolean, ticketSold: number, showName: string, isFirstOfMultiple: boolean) {
    const template = fs.readFileSync(path.join("mail-ticketbuyers", "templates",
        daytime ? "day.txt" :
            "night-" + (ticketSold >= 100 ? "lots" : "some") + "-sold.txt"), "utf-8").split("\n")

    // The web editor does not read newlines when we insert as html instead of normal text
    // (Yes we need html, we add hyperlinks)
    for (let i = 0; i < template.length; i++) {
        const line = template[i]
        if (line !== "") {
            template[i] = "<p>" + line + "</p>"
        }
    }

    return template.join("")
        .replace("%forestillingsnavn%", showName)
        // .replace("%ting-count%", isFirstOfMultiple ? "Tre" : "To")
        // .replace("%last-ting-count%", isFirstOfMultiple ? "tre" : "to")
        // .replace("%bonusshow%", isFirstOfMultiple && !daytime ? fs.readFileSync("bonusshow.txt", "utf8") : "")
        .replace("detandreteatret.no", "<a href='https://detandreteatret.no'>detandreteatret.no</a>")
}

function isValidForMailSend(show: Show, forDayTimeShows: boolean) {
    const showinfo = `"${show.showName}"(${show.id})`
    if (show.showName.toLowerCase().includes("kurs") || show.showName.toLowerCase().includes("popkorn")) {
        console.log(`Show ${showinfo} seems to be a non-show, ignoring...`)
        return false
    }
    if (!isToday(show.dateStart)) {
        console.log(`Show ${showinfo} is not today, ignoring...`)
        return false
    }
    if (forDayTimeShows && show.dateStart.getHours() > 14) {
        console.info(`Show ${showinfo} is a night time show, but the mail send routine is for daytime shows, ignoring...`)
        return false
    }
    if (!forDayTimeShows && show.dateStart.getHours() < 14) {
        console.info(`Show ${showinfo} is a day time show, but the mail send routine is for night time shows, ignoring...`)
        return false
    }

    return true
}

function isToday(date: Date) {
    const now = new Date()

    return (now.getFullYear() === date.getFullYear() &&
        now.getMonth() === date.getMonth() &&
        now.getDate() === date.getDate())
}

// Script start

if (process.argv.length < 3) {
    throw Error("Please tell me either --day or --night so i know which shows to check mailing for")
}
if (process.argv.length > 4) {
    throw new Error("Too many arguments!!")
}

let daytime: boolean
switch (process.argv[2]) {
    case "--day": daytime = true; break
    case "--night": daytime = false; break
    default: throw new Error("Please tell me either --day or --night so i know which shows to check mailing for")
}

checkMailVibes(daytime)
