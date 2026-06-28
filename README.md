# 🚴 RideCheck

**Should you ride today?** RideCheck is a cycling conditions PWA that gives you an honest ride score, gear recommendations, and a food checker — all in one glance.

**[→ Try it live](https://ridecheckforvampires.netlify.app)**

---

## What it does

RideCheck answers the question every cyclist asks before clipping in: *"What are conditions like right now?"*

- **Ride Score (0–100)** — Deduction-only algorithm that factors in temperature, humidity, wind, precipitation, UV, cloud cover, and daylight. A 100 means genuinely perfect conditions. It has to be earned.
- **Best Window** — "Ride 4:00 PM – 5:00 PM in shorts and jersey" tells you exactly when and what to wear.
- **7-Day Forecast** — Each day scored using hourly best-window analysis with hazard penalties and timing hints (AM ride, PM ride).
- **What to Wear** — Comprehensive gear list adjusted for temperature, wind, rain probability, UV, ride intensity, bike type, and duration.
- **Food Checker** — 76 foods scored for cycling performance with timing recommendations (pre/during/post), explanations, and nutrient breakdowns.
- **Ride Log** — Track rides with distance, duration, feel, and conditions. Monday-based weekly goals with streak tracking.

## Weather Data

RideCheck uses a dual-source weather architecture:

- **US locations** — [National Weather Service API](https://www.weather.gov/documentation/services-web-api) for hourly and daily forecasts (the same data that powers Apple Weather and Weather.gov). [Open-Meteo](https://open-meteo.com/) for current conditions, UV index, and air quality.
- **Non-US locations** — Open-Meteo for all weather data.
- **Graceful fallback** — If NWS is unavailable, Open-Meteo handles everything.

## Scoring Philosophy

The ride score starts at 100 and only deducts. The only bonus is +2 for clear skies. Every real condition that degrades a ride costs points:

| Factor | Example penalty |
|---|---|
| Temperature outside 62–72°F | -3 to -45 |
| Humidity above 50% | -2 to -12 |
| Humidity × heat combo | up to -15 |
| Wind above 8 mph | -3 to -40 |
| Precipitation | -12 to -50 |
| Overcast skies | -3 |
| UV 6+ | -3 to -8 |
| After sunset | -40 |

Forecast days use the same penalty table applied to the best 3-hour riding window, with additional hazard penalties for storms, extreme heat, or snow anywhere in the day.

## Tech Stack

- Single-file PWA (HTML + CSS + JS, no framework)
- Deployed to Netlify via GitHub
- No API keys required (NWS and Open-Meteo are free)
- Dark mode default, mobile-first
- Service worker for update detection
- localStorage for ride log, settings, and saved setups

## Features

### Today Tab
- Ride confidence score with weather icon and animated progress bar
- Glanceable summary ("Ride 3–4 PM in shorts and jersey")
- Quick stats: wind with compass arrow, humidity, temperature, UV
- Sunrise/sunset times
- Air quality index with color-coded indicator
- 8-hour hourly forecast strip
- 3-day "Coming Up" mini outlook

### Forecast Tab
- 7-day ride scores with hourly window analysis
- Timing hints (AM ride, PM ride, all-day)
- Tappable detail sheets with hourly breakdown, rain probability, kit recommendation
- Best day highlighted

### Prep Tab
- Saved ride setups (bike type, distance, intensity)
- What to Wear — weather-aware gear list with intensity adjustment
- Hydration & fueling engine based on distance, temperature, and humidity
- Post-ride recovery recommendations
- Food Checker — 76 foods with cycling-specific scores and explanations

### Log Tab
- Log rides with distance, duration, feel, and weather snapshot
- Monday-based weekly goal with streak tracking
- Date-grouped entries (Today, Yesterday, This week, etc.)
- Filter by ride type and feel
- Export as CSV

### Other
- Location search with auto-history
- Onboarding walkthrough with weight input
- Settings: temperature unit, distance unit (mi/km), dark mode, weight, Strava integration (placeholder)

## Local Development

It's a single HTML file. Just open it:

```bash
git clone https://github.com/chrisjohans-maker/ridecheckforvampires.git
cd ridecheckforvampires
open index.html
```

Or serve locally for service worker support:

```bash
npx serve .
```

## Deployment

Push to `main` and Netlify auto-deploys. The `sw.js` file must change with each deploy (build timestamp) to trigger browser updates.

## Credits

- Weather data: [Open-Meteo](https://open-meteo.com/) and [National Weather Service](https://www.weather.gov/)
- Air quality: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- Geocoding: [Nominatim / OpenStreetMap](https://nominatim.org/)
- Font: DM Sans + Space Grotesk via Google Fonts

## License

MIT
