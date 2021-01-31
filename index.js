const puppeteer = require("puppeteer");
const fs = require("fs");
const PNG = require("pngjs").PNG;
const pixelmatch = require("pixelmatch");
const os = require("os");
const nodemailer = require("nodemailer");
const conf = require("./config").credentials;
const sharp = require("sharp");
const jImg = require("join-images");

const notify = require("./notify").notify;

const mail = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: conf.senderEmail,
    pass: conf.senderPassword,
  },
});

const url = "https://www.zeltazivtina.lv/zz-bonusu-klubs/";

// Banner positions
const CROP_POINTS = [
  2257, // 2281 - 24
  2913, // 2935 - 22
  3567, // 3590 - 23
  4223, // 4245 - 22
  4878, // 4900 - 22
  5533, // 5555 - 22
  6188, // 6210 - 22
  6843, // 6865 - 22
  7498, // 7521 - 23
  8153, // 8175 - 22
  8807, // 8831 - 24
  9461, // 9486 - 23
  10115, // 10141 - 23
  10781, // 10803 - 22
  11436, // 11458 - 22
  12091, // 12113 - 22
  12746, // 12768 - 22
  13401, // 13423 - 22
  14055, // 14078 - 22
  14711, // 14733 - 22
  15365, // 15389 - 24
  16016,
];

const urlToFileMap = {
  [url]: "h",
};

const tDuration = 1000 * 60;
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
      // Deleting very old images
      if (counter - 2 >= 0) {
        fs.unlinkSync(
          `./images/${urlToFileMap[url]}-stitch-${counter - 2}.png`
        );
      }

      const img1 = fs
        .createReadStream(
          `./images/${urlToFileMap[url]}-stitch-${counter - 1}.png`
        )
        .pipe(new PNG())
        .on("parsed", doneReading);
      const img2 = fs
        .createReadStream(`./images/${urlToFileMap[url]}-stitch-${counter}.png`)
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

        if (numDiffPixels > 0) {
          fs.writeFileSync(
            `./images/diff-${counter}.png`,
            PNG.sync.write(diff)
          );
        }

        resolve(numDiffPixels);
      }
    } catch (e) {
      console.log(e);
    }
  });
};

const BAN_H = 50;

const getScreenshotAndCompare = async () => {
  console.log(`${new Date()}: Getting screenshot: ${counter}`);
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

    const filePath = `./images/${urlToFileMap[url]}-${counter}.png`;

    await page.screenshot({
      path: filePath,
      fullPage: true,
    });

    const handles = [];
    console.log(`${new Date()}: Cropping.`);
    // Cropping till the banner occurance
    for (let i = 0; i < CROP_POINTS.length; i++) {
      const sharpHandle = sharp(filePath);

      const prevBannerStart = CROP_POINTS[i - 1] || 0;
      const bannerStart = CROP_POINTS[i];

      sharpHandle.extract({
        top: prevBannerStart + (i > 0 ? BAN_H : 0),
        left: 0,
        width: 1200,
        height: i === 0 ? bannerStart : bannerStart - prevBannerStart - BAN_H,
      });

      handles.push(sharpHandle);
    }

    console.log(`${new Date()}: Creating buffers.`);

    const bPromises = handles.map((h) => {
      return h.toBuffer();
    });

    const buffers = await Promise.all(bPromises);

    console.log(`${new Date()}: Stiching.`);

    const result = await jImg.joinImages(buffers);

    await result.toFile(`./images/${urlToFileMap[url]}-stitch-${counter}.png`);

    fs.unlinkSync(filePath);

    if (counter == 0) {
      console.log(`${new Date()}: Nothing to compare.`);
      counter++;
      return;
    }

    const comparison = await compare(url);

    console.log(`${new Date()}: Comparison result: ${comparison}`);

    if (comparison > 0) {
      notify(`We many changes!`, url);

      await mail.sendMail({
        priority: "high",
        to: conf.recieverEmail,
        subject: conf.subject,
        text: `Go to: ${url} if you see something!`,
        attachments: [
          {
            filename: "diff.png",
            path: `./images/diff-${counter}.png`,
          },
        ],
      });
    }
  } catch (e) {
    console.log(e);
  } finally {
    browser && browser.close();
  }

  counter++;
};

getScreenshotAndCompare();
setInterval(getScreenshotAndCompare, tDuration);
