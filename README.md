# oopsallpunters

Oops All Punters is a fan-made fantasy football companion app for tracking punter-only fantasy scoring alongside a Sleeper league.

It is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-FFDD00?style=flat-square)](https://buymeacoffee.com/justinrice)

## How It Works

Oops All Punters combines your Sleeper league with NFL punting statistics to create a fantasy scoring experience focused entirely on punters.

1. **Connect your Sleeper league** — The app reads public league data from Sleeper to identify your league and its teams.
2. **Pull NFL statistics** — Player and game statistics are sourced from [nflverse](https://github.com/nflverse), specifically the [nflverse-data](https://github.com/nflverse/nflverse-data) repository.
3. **Calculate punter fantasy scores** — Punting statistics are converted into fantasy points using the league's punter-specific scoring rules.
4. **Track the competition** — Scores and rankings let you see how your punters are performing throughout the season.

The goal is simple: **take the most undervalued positions in fantasy football and make it valued.**

## Data Sources & Attribution

NFL player and statistical data used by Oops All Punters is provided by the [nflverse](https://github.com/nflverse) project, specifically the [nflverse-data](https://github.com/nflverse/nflverse-data) repository.

A huge thank-you to the nflverse contributors for collecting, maintaining, and making this data available to the community.

Please note that the NFL data is provided by nflverse and ultimately belongs to its respective data owners. Oops All Punters is not affiliated with or endorsed by nflverse or the NFL.

## Disclaimer

Oops All Punters is an independent, fan-made companion app for tracking punter-only fantasy scoring alongside a Sleeper league. It is **not affiliated with, endorsed by, or created by Sleeper**.

"Sleeper" and any related marks belong to their respective owners. This project only reads public league data via Sleeper's API to support its own punter-scoring feature.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open http://localhost:3000 with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at these resources:

* [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
* [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
* [v0 Documentation](https://v0.app/docs) - learn how to build with v0.
* [nflverse](https://github.com/nflverse) - NFL data and analytics community.
* [nflverse-data](https://github.com/nflverse/nflverse-data) - source repository for nflverse data.
* [Sleeper API Documentation](https://docs.sleeper.com/) - documentation for the public Sleeper API.
