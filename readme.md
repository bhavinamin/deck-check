# Steam Deck availability scraper

This repository runs a GitHub Actions workflow that checks Steam Deck inventory using Puppeteer.

It currently checks two Steam storefront pages:
- Refurbished inventory: `https://store.steampowered.com/sale/steamdeckrefurbished/`
- Retail inventory: `https://store.steampowered.com/steamdeck/`

The workflow:
- runs on push and manual dispatch
- installs Node.js 20 and project dependencies
- runs the stock checker script at `scripts/check-stock.js`
- sends a Discord notification when stock is detected
- fails in GitHub Actions when scraping or notification delivery fails
- includes a separate manual workflow to smoke-test Discord delivery

The stock checker:
- uses Puppeteer on a GitHub-hosted runner
- checks both refurbished and retail pages in one run
- parses visible product and call-to-action text to infer stock status
- treats pages independently so one failing source does not prevent the other from being checked
- posts one aggregated Discord webhook message for any in-stock SKUs found in that run

Project files:
- `.github/workflows/steamdeck.yml`: stock check workflow
- `.github/workflows/test-discord.yml`: manual Discord webhook smoke test
- `package.json`: Node project metadata and dependencies
- `scripts/check-stock.js`: inventory detection logic
- `scripts/test-discord.js`: standalone Discord webhook smoke test

Notes:
- Retail page detection is based on rendered page text and broad DOM heuristics, so selector tuning may still be needed if Steam changes markup.
- Add a repository secret named `DISCORD_WEBHOOK_URL` before enabling notifications.
- Without persistent state, the workflow will notify on every run where stock is still available.
- Run the `Test Discord Notification` workflow from the Actions tab to verify the webhook independently of stock availability.
