const notifier = require("node-notifier");
const puppeteer = require("puppeteer");

module.exports = {
  notify: (msg, url) => {
    notifier.notify(
      {
        title: "ZZ",
        message: msg,
        icon: "./icon.png",
        appID: "ZZ Image",
        id: "duk",
        type: "error",
      },
      async (err, response, metadata) => {
        const browser = await puppeteer.connect({
          browserURL: "http://127.0.0.1:21222",
          defaultViewport: false,
        });

        const page = await browser.newPage();

        page.goto(url);
      }
    );
  },
};
