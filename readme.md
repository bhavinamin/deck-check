# Steam Deck availability scraper

This repository runs a GitHub Actions workflow that checks Steam Deck inventory on a schedule using Puppeteer.

It currently checks two Steam storefront pages:
- Refurbished inventory: `https://store.steampowered.com/sale/steamdeckrefurbished/`
- Retail inventory: `https://store.steampowered.com/steamdeck/`

The workflow:
- runs on push, manual dispatch, and hourly on a schedule
- installs Node.js 20 and project dependencies
- runs the stock checker script at `scripts/check-stock.js`
- sends a Discord notification when stock is detected
- fails in GitHub Actions when scraping or notification delivery fails

The stock checker:
- uses Puppeteer on a GitHub-hosted runner
- checks both refurbished and retail pages in one run
- parses visible product and call-to-action text to infer stock status
- treats pages independently so one failing source does not prevent the other from being checked
- posts one aggregated Discord webhook message for any in-stock SKUs found in that run

Project files:
- `.github/workflows/steamdeck.yml`: scheduled GitHub Actions workflow
- `package.json`: Node project metadata and dependencies
- `scripts/check-stock.js`: inventory detection logic

Notes:
- Retail page detection is based on rendered page text and broad DOM heuristics, so selector tuning may still be needed if Steam changes markup.
- Add a repository secret named `DISCORD_WEBHOOK_URL` before enabling notifications.
- Without persistent state, the workflow will notify on every run where stock is still available.
