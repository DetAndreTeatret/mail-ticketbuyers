import puppeteer, {Browser} from "puppeteer"
import fs from "node:fs"

let browser: Browser // Dont get this directly, use #getBrowser

async function getBrowser() {
  if (browser) {return browser}

  browser = await puppeteer.launch({
    headless: false,
    args: ["--disable-setuid-sandbox"],
    // slowMo: 1
  })

  return browser
}

export async function getCleanPage() {
  const browser = await getBrowser()

  const page = await browser.newPage()

  // Forward relevant console info from browser console to node console
  page.on("console", message => {
    if (message.type() === "info" || message.type() === "dir") {
      console.info("[Puppeteer INFO]" + message.text())
    }
  })

  return page
}

export async function getTicketCoPage() {
  const page = await getCleanPage()

  await page.goto("https://ticketco.events/no/nb/admin")

  await page.type("#user_username", process.env["USERNAME"]!)
  await page.type("#user_password", process.env["PASSWORD"]!)

  await page.click("button[type=\"submit\"]")
  await page.waitForNavigation()

  if (page.url().includes("sign_in")) {
    throw new Error("Login failed!! :(")
  }

  console.log("Login done!")

  return page
}
