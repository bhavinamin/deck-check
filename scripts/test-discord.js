const https = require("https");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

function timestamp() {
  return new Date().toISOString();
}

function sendDiscordTestNotification() {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error("DISCORD_WEBHOOK_URL is not configured.");
  }

  const payload = JSON.stringify({
    content: [
      "Steam Deck notifier test",
      `Timestamp: ${timestamp()}`,
      "This is a manual webhook smoke test from GitHub Actions.",
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
  try {
    await sendDiscordTestNotification();
    console.log("Discord webhook test notification sent successfully.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
