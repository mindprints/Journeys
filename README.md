# Museum of Artificial Intelligence Gallery

An interactive, scroll-driven 3D poster gallery for exploring AI timelines, image posters, and website cards. The UI is powered by a CSS-first carousel that rotates based on a scroll-linked custom property, with a small JS bridge to keep scroll position and carousel state in lockstep.

## Highlights
- CSS scroll-driven animation controls the carousel via the `--k` custom property.
- Poster types: timeline JSON posters, image posters (JSON-wrapped or direct images), and website posters.
- Built-in editors for posters, images, websites, and journeys.
- Express API that serves static assets and persists JSON/image content to `JSON_Posters`.
- Unified v2 poster backs render in a 16:9 layout with tunable CSS variables.

## How the Scroll-Driven Carousel Works
The core animation is CSS-only, driven by a scroll-timeline:

- `base.css` defines the scroll-linked custom property `--k` using `@property` and `@keyframes k`.
- `body` is fixed, while `html` is given a synthetic height (`height: calc(var(--n) * 100%)`) so the scroll distance maps to the number of posters.
- `carousel.css` uses `--k` to rotate the whole ring and to derive per-item focus/selection values.
- `js/script.js` reads computed `--k` and calls `scrollTo(...)` to keep scroll position and rotation in sync (and to clamp the scroll when a poster flip is active).

This creates a scroll-driven 3D carousel without manual frame-by-frame JS animation.

## Running Locally
1. Install dependencies
   ```bash
   npm install
   ```
2. Start the server
   ```bash
   npm run dev
   ```
3. Open the gallery
   ```
   http://localhost:3000
   ```

## Project Structure
- `index.html`: Main gallery view.
- `css/base.css`: Scroll-linked animation and global layout.
- `css/carousel.css`: 3D carousel math and poster transforms.
- `js/script.js`: Scroll sync, poster focus, and interactions.
- `js/loadPosters.js`: Renders posters by type.
- `server.js`: Express API and file persistence.
- `JSON_Posters/`: Content directories and `Journeys`.
- `poster-editor.html`: JSON poster editor.
- `image-editor.html`: Image uploader + JSON wrapper creator.
- `website-editor.html`: Website poster editor.
- `journey-editor.html`: Journey builder (ordered poster lists).

## Poster Data Formats
### Unified v2 poster
```json
{
  "version": 2,
  "uid": "poster-123",
  "front": {
    "title": "Poster Title",
    "subtitle": "Optional subtitle"
  },
  "back": {
    "layout": "auto",
    "text": "Markdown-supported back content",
    "links": [
      { "type": "external", "label": "Primary", "primary": true, "url": "https://example.com" }
    ]
  },
  "meta": {
    "categories": ["VIPs"],
    "tags": ["AI", "research"]
  }
}
```

### Timeline JSON poster
```json
{
  "uid": "poster-1700000000000",
  "figure": "Title on front",
  "header": "Back-side content. Use blank lines to create paragraphs.",
  "chronology": {
    "epochStart": 1956,
    "epochEnd": 2024,
    "epochEvents": [
      { "year": 1956, "name": "Dartmouth workshop" }
    ]
  }
}
```

### Image poster (JSON wrapper)
```json
{
  "type": "image",
  "imagePath": "JSON_Posters/MyCategory/images/example.webp",
  "title": "Optional title",
  "description": "Optional back-side text",
  "alt": "Accessible alt text",
  "annotations": [
    { "text": "Label", "position": { "x": 42, "y": 18 } }
  ]
}
```

### Website poster
```json
{
  "type": "website",
  "title": "Example",
  "url": "https://example.com",
  "description": "Optional description",
  "thumbnail": "JSON_Posters/MyCategory/images/example.webp"
}
```

Direct images placed in category folders (or `images/` subfolders) are also displayed as posters without a JSON wrapper.

## Editor Workflows
- Poster Editor: Create and edit timeline JSON posters, including chronology and events.
- Image Editor: Drag/drop or paste images, crop/resize, and optionally generate JSON wrappers.
- Website Editor: Build URL posters with optional thumbnails.
- Journey Editor: Curate ordered poster lists saved in `JSON_Posters/Journeys`.

## V2 Back Tuning
Use the live tuner to match the v2 back layout between the carousel and the editor preview.

1. Start the server: `npm run dev`
2. Open `http://localhost:3000/v2-back-tuner.html?directory=JSON_Posters/VIPs&poster=Andrej_Karpathy.json`
3. Adjust sliders and copy the CSS variables into `css/poster-v2.css`

The tuner also broadcasts changes to the live carousel via `BroadcastChannel`.

## API Overview
The Express server serves static files and exposes endpoints for editors:

- `GET /api/load-options` (categories + journeys)
- `GET /api/posters-in-directory?directory=...`
- `POST /api/posters-by-filenames`
- `GET /api/directories`
- `GET /api/all-posters`
- `GET /api/journeys` / `GET /api/journey/:filename`
- `POST /api/save-poster` / `POST /api/save-image` / `POST /api/save-file`
- `POST /api/create-directory` / `POST /api/create-images-directory`
- `POST /api/delete-poster` / `POST /api/delete-journey`

## Browser Support Notes
Scroll-driven animations require `animation-timeline: scroll()` support. Chromium-based browsers support this, and Firefox supports it with the `layout.css.scroll-driven-animations.enabled` flag. If unsupported, a notice is shown at the bottom of the page.

## Tips
- Use Shift + click (or Shift + Enter) on the centered poster to open the full article view.
- Only the centered poster is interactive; others ignore flip/open actions.
- The number of posters controls the scroll length via the `--n` CSS variable.

## License
ISC (see `package.json`).
