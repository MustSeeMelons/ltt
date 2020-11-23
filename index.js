const puppeteer = require("puppeteer");
const fs = require("fs");
const PNG = require("pngjs").PNG;
const pixelmatch = require("pixelmatch");
const winston = require("winston");
const os = require("os");
const nodemailer = require("nodemailer");
require("winston-daily-rotate-file");

const mail = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "mail@gmail.com",
    pass: "pass",
  },
});

const transport = new winston.transports.DailyRotateFile({
  filename: "application-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "2d",
});

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [transport],
});

const URLS = [
  "https://www.lttstore.com/",
  "https://www.lttstore.com/collections/all",
  "https://www.lttstore.com/collections/all?page=2",
];

const urlToFileMap = {
  [URLS[0]]: "home",
  [URLS[1]]: "all-p1",
  [URLS[2]]: "all-p2",
};

const tDuration = 1000 * 60 * 10;
let counter = 0;

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

const compare = (url) => {
  return new Promise((resolve) => {
    try {
      const img1 = fs
        .createReadStream(`./images/${urlToFileMap[url]}-${counter - 1}.png`)
        .pipe(new PNG())
        .on("parsed", doneReading);
      const img2 = fs
        .createReadStream(`./images/${urlToFileMap[url]}-${counter}.png`)
        .pipe(new PNG())
        .on("parsed", doneReading);

      let filesRead = 0;
      function doneReading() {
        if (++filesRead < 2) return;

        if (img1.width !== img2.width || img1.height !== img2.height) {
          resolve(0);
        }

        const diff = new PNG({ width: img1.width, height: img2.height });
        const numDiffPixels = pixelmatch(
          img1.data,
          img2.data,
          diff.data,
          img1.width,
          img1.height,
          { threshold: 0.1 }
        );

        resolve(numDiffPixels);
      }
    } catch (e) {
      console.log(e);
    }
  });
};

const getScreenshotAndCompare = async () => {
  const promises = URLS.map(async (url) => {
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: os.arch() === "arm" ? "chromium-browser" : undefined,
        headless: true,
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);

      await page.goto(url);

      await page.setViewport({
        width: 1200,
        height: 800,
      });

      await autoScroll(page);

      await page.waitForFunction(
        async () => {
          return await new Promise((resolve) => {
            setTimeout(() => resolve(true), 3000);
          });
        },
        {
          timeout: 0,
        }
      );

      await page.screenshot({
        path: `./images/${urlToFileMap[url]}-${counter}.png`,
        fullPage: true,
      });

      if (counter == 0) {
        return;
      }

      const comparison = await compare(url);

      if (comparison > 0) {
        logger.info(url);
        await mail.sendMail({
          to: "my_email@gmail.com",
          subject: "LTT Store",
          attachments: [
            {
              filename: "Previous.png",
              path: `./images/${urlToFileMap[url]}-${counter - 1}.png`,
            },
            {
              filename: "Current.png",
              path: `./images/${urlToFileMap[url]}-${counter}.png`,
            },
          ],
        });
      }
    } catch (e) {
      console.log(e);
    } finally {
      browser && browser.close();
    }
  });

  Promise.all(promises).then(() => {
    counter++;
  });
};

getScreenshotAndCompare();
setInterval(getScreenshotAndCompare, tDuration);
