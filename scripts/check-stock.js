const https = require("https");
const puppeteer = require("puppeteer");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const ENABLED_SOURCES = new Set(
  (process.env.STEAMDECK_SOURCES || "refurbished,retail")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const SOURCES = [
  {
    key: "refurbished",
    label: "Refurbished",
    url: "https://store.steampowered.com/sale/steamdeckrefurbished/",
    products: [
      {
        name: "Steam Deck 512 GB OLED",
        aliases: ["Steam Deck 512 GB OLED", "Steam Deck 512GB OLED"],
      },
      {
        name: "Steam Deck 1TB OLED",
        aliases: ["Steam Deck 1TB OLED", "Steam Deck 1 TB OLED"],
      },
      {
        name: "Steam Deck 64 GB LCD",
        aliases: ["Steam Deck 64 GB LCD", "Steam Deck 64GB LCD"],
      },
      {
        name: "Steam Deck 256 GB LCD",
        aliases: ["Steam Deck 256 GB LCD", "Steam Deck 256GB LCD"],
      },
      {
        name: "Steam Deck 512 GB LCD",
        aliases: ["Steam Deck 512 GB LCD", "Steam Deck 512GB LCD"],
      },
    ],
  },
  {
    key: "retail",
    label: "Retail",
    url: "https://store.steampowered.com/steamdeck/",
    products: [
      {
        name: "Steam Deck 256GB LCD",
        aliases: ["256GB LCD", "256 GB LCD"],
      },
      {
        name: "Steam Deck 512GB OLED",
        aliases: ["512GB OLED", "512 GB OLED"],
      },
      {
        name: "Steam Deck 1TB OLED",
        aliases: ["1TB OLED", "1 TB OLED"],
      },
    ],
  },
];

const POSITIVE_STATUS_PATTERN = /add to cart|buy now|purchase/i;
const NEGATIVE_STATUS_PATTERN = /out of stock|sold out|unavailable|notify me/i;
const STATUS_WINDOW_LENGTH = 220;

function timestamp() {
  return new Date().toISOString();
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function previewText(text, maxLength = 240) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function parseStatuses(pageText, source) {
  const statuses = [];

  for (const product of source.products) {
    let matchIndex = -1;
    let matchValue = null;

    for (const alias of product.aliases) {
      const index = pageText.indexOf(alias);
      if (index !== -1) {
        matchIndex = index;
        matchValue = alias;
        break;
      }
    }

    if (matchIndex === -1 || !matchValue) {
      continue;
    }

    const contextStart = Math.max(0, matchIndex - 40);
    const contextEnd = Math.min(
      pageText.length,
      matchIndex + matchValue.length + STATUS_WINDOW_LENGTH
    );
    const context = pageText.slice(contextStart, contextEnd);
    const isPositive = POSITIVE_STATUS_PATTERN.test(context);
    const isNegative = NEGATIVE_STATUS_PATTERN.test(context);

    if (!isPositive && !isNegative) {
      continue;
    }

    statuses.push({
      source: source.key,
      sourceLabel: source.label,
      product: product.name,
      isInStock: isPositive && !isNegative,
      rawText: context,
    });
  }

  return statuses;
}

async function collectPageText(page, source) {
  await page.goto(source.url, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  await page.waitForSelector("body", { timeout: 15000 });

  await page
    .waitForFunction(
      () =>
        /steam deck/i.test(document.body.innerText) &&
        /(add to cart|buy now|out of stock|sold out|notify me|unavailable)/i.test(
          document.body.innerText
        ),
      { timeout: 20000 }
    )
    .catch(() => null);

  const pageText = await page.evaluate(() => {
    return (document.body.innerText || document.body.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  });

  if (!pageText) {
    throw new Error(`No page text found on ${source.key} page.`);
  }

  return normalizeText(pageText);
}

function sendDiscordNotification(statuses) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log(
      "Stock was detected, but DISCORD_WEBHOOK_URL is not configured. Skipping Discord notification."
    );
    return Promise.resolve();
  }

  const payload = JSON.stringify({
    allowed_mentions: {
      parse: ["everyone"],
    },
    content: [
      "@here",
      "Steam Deck stock detected:",
      ...statuses.map(
        (status) => `- ${status.sourceLabel}: ${status.product} (${timestamp()})`
      ),
    ].join("\n"),
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      DISCORD_WEBHOOK_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
            return;
          }

          reject(
            new Error(
              `Discord webhook failed with status ${response.statusCode || "unknown"}${body ? `: ${body}` : ""}`
            )
          );
        });
      }
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

(async () => {
  let browser;
  const errors = [];
  const inStockStatuses = [];
  let recognizedSources = 0;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    for (const source of SOURCES) {
      if (!ENABLED_SOURCES.has(source.key)) {
        continue;
      }

      const page = await browser.newPage();

      try {
        const pageText = await collectPageText(page, source);
        const statuses = parseStatuses(pageText, source);

        if (statuses.length === 0) {
          console.warn(
            [
              `No recognizable Steam Deck inventory statuses found on ${source.key} page.`,
              `Page text preview: ${previewText(pageText)}`,
            ].join(" ")
          );
          continue;
        }

        recognizedSources += 1;

        const sourceInStockStatuses = statuses.filter((status) => status.isInStock);

        if (sourceInStockStatuses.length === 0) {
          console.log(`No ${source.key} Steam Deck inventory is in stock.`);
        } else {
          for (const status of sourceInStockStatuses) {
            inStockStatuses.push(status);
            console.log(`${status.sourceLabel}: ${status.product} is in stock.`);
          }
        }
      } catch (error) {
        const message = `${source.label}: ${error.message}`;
        errors.push(message);
        console.error(error);
      } finally {
        await page.close();
      }
    }

    if (inStockStatuses.length > 0) {
      await sendDiscordNotification(inStockStatuses);
    }

    if (recognizedSources === 0 && errors.length === 0) {
      console.error("No recognizable Steam Deck inventory statuses found on any enabled source.");
      process.exitCode = 1;
    }

    if (errors.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
