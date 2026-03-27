# Steak & Lobster Tracker

A lightweight static website for anonymously reporting when U.S. service members receive steak and lobster for dinner.

## Features

- Anonymous submission form with no personal identifier fields
- Required installation/location label plus required country input for automatic map plotting
- Regional heat map visualization using Leaflet and `leaflet.heat`
- Installation labels represented in regional map popups so each entered label is logged on the map view
- Installation and country entry with Google Maps Geocoding API before map plotting
- Adjustable X-Y time-series chart for report volume over time
- Compiled recent reports table showing raw submitted data
- Local browser storage for demo-friendly persistence

## Running locally

Because this is a static site, you can serve it with any simple HTTP server.

```bash
python3 -m http.server 8123
```

Then open:

```text
http://127.0.0.1:8123/
```

## Files

- `index.html` — page structure and dashboard layout
- `styles.css` — responsive dashboard styling
- `app.js` — report handling, installation/country geocoding via Google Maps API, heat map rendering, chart rendering, and local storage logic

## Notes

- Reports are stored only in the browser's `localStorage` in the current implementation.
- Installation and country inputs are converted to map coordinates through the Google Maps Geocoding API at submission time.
- The application visualizes submitted data but does not interpret or classify reports.

- A browser-enabled Google Maps Geocoding API key is required in the form to geocode new submissions.
