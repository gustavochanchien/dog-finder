# Paw Swipe — ABQ Shelter Dogs

A Tinder-style dog adoption app for Albuquerque Animal Welfare shelters, powered by the 24PetConnect API.

## Project Structure

- `index.html` — Single-file React app (vanilla JS, no build step). Contains all UI components, styles, and app logic.
- `server.js` — Node.js HTTP proxy server. Serves static files and proxies requests to the 24PetConnect API and Nominatim geocoding service to avoid CORS issues.
- `get_animals.js` — Fetch/parse logic for the 24PetConnect API. Included as a `<script>` tag in `index.html`.
- `breeds.json` — Static breed data (traits: care, exercise, shedding, size) used for the breed info panel.

## Running the App

```bash
node server.js
# Open http://localhost:3000
```

No build step, no npm install required.

## Architecture Notes

- **No framework toolchain**: React is loaded via CDN. All JS is ES5-compatible except for `async/await` in `get_animals.js`.
- **Proxy server**: `server.js` proxies `/api/petconnect/*` to `https://24petconnect.com/` and `/api/geocode` to Nominatim (OpenStreetMap).
- **Local storage**: Swipe history (`ps4_sw`), known dogs (`ps4_kn`), cached animals (`ps4_ca`), and config (`ps4_cfg`) are persisted to `localStorage`.
- **Detail prefetch**: Animal details are lazily fetched and cached in a React ref; the first 30 queued dogs are prefetched on load.
- **Breed matching**: `matchBreeds()` in `index.html` does fuzzy word-overlap matching against `breeds.json`.

## Key Behaviors

- Dogs default to Albuquerque coordinates (lat `35.06928`, lon `-106.577461`), 25mi radius.
- ZIP code input geocodes via Nominatim and updates the search coordinates.
- "New" dogs (not seen before) are surfaced first in the swipe queue.
- Swiped-left dogs whose shelter listing disappears are silently removed from history; swiped-right (loved) dogs are marked "Adopted" instead.
- Sample dogs are hardcoded in `get_animals.js` for offline/demo use.
