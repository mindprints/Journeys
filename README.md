# Museum of Artificial Intelligence Gallery

An interactive, scroll-driven 3D poster gallery for exploring AI timelines, image posters, and website cards. The UI is powered by a CSS-first carousel that rotates based on a scroll-linked custom property, with a small JS bridge to keep scroll position and carousel state in lockstep.

## Highlights
- CSS scroll-driven animation controls the carousel via the `--k` custom property.
- Poster types: timeline JSON posters, image posters (JSON-wrapped), and website posters.
- Built-in editors for posters, images, websites, and journeys.
- Express API that serves static assets and persists JSON/image content to `JSON_Posters/Posters`.
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
2. Start the app
   ```bash
   npm run restart:dev
   ```
3. Open the gallery
   ```
   http://localhost:3010
   ```

Alternative start commands:
- `npm start` (production-like single process)
- `npm run dev` (nodemon)
- `npm run restart` (kills common ports and restarts backend)

## Project Structure
- `index.html`: Main gallery view.
- `css/base.css`: Scroll-linked animation and global layout.
- `css/carousel.css`: 3D carousel math and poster transforms.
- `js/script.js`: Scroll sync, poster focus, and interactions.
- `js/loadPosters.js`: Renders posters by type.
- `server.js`: Express API and file persistence.
- `JSON_Posters/Posters/`: Central poster store.
- `JSON_Posters/Journeys/`: Curated poster lists.
- `category-editor.html`: Category + topic management and generator controls.
- `unified-editor.html`: Unified v2 poster editor with single and bulk actions.
- `image-editor.html`: Image uploader + JSON wrapper creator.
- `journey-editor.html`: Journey builder (ordered poster lists).

## Poster Data Formats
### Unified v2 poster
```json
{
  "version": 2,
  "uid": "poster-123",
  "type": "poster-v2",
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
    "created": "2026-02-08T00:00:00Z",
    "modified": "2026-02-08T00:00:00Z",
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
  "imagePath": "images/originals/example.webp",
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
  "thumbnail": "images/originals/example.webp"
}
```

Direct images are stored in `images/originals` and should be referenced by v2 poster JSON files.

## Editor Workflows
- Unified Editor: Create and edit v2 posters, including categories/tags metadata and multi-select bulk actions.
- Image Editor: Drag/drop or paste images, crop/resize, and optionally generate v2 poster JSON.
- Journey Editor: Curate ordered poster lists saved in `JSON_Posters/Journeys`.
- Category Editor: CRUD for categories/topics, run Wikipedia generator, and cascade category deletion.

## Category Metadata
Categories and tags drive carousel organization and filtering. Categories are stored in `meta.categories`.

Fallback behavior:
- When category deletion removes a category from posters, any poster left with zero categories is assigned `No-Category`.
- In Unified Editor, assigning a real category removes fallback labels (`No-Category` / `Uncategorized`).

Example:
```json
{
  "meta": {
    "categories": ["Pioneers", "Reinforcement Learning"],
    "tags": ["historical", "research", "algorithms"]
  }
}
```

Guidelines:
- Use broad, user-facing categories for carousels (e.g., `Pioneers`, `Topics`, `Contemporary Tools`).
- Use tags for finer-grained filtering (e.g., `reinforcement-learning`, `neurosymbolic`, `benchmark`).

## V2 Back Tuning
Use the live tuner to match the v2 back layout between the carousel and the editor preview.

1. Start the server: `npm run restart:dev`
2. Open `http://localhost:3010/v2-back-tuner.html?directory=JSON_Posters/Posters&poster=Andrej_Karpathy.json`
3. Adjust sliders and copy the CSS variables into `css/poster-v2.css`

The tuner also broadcasts changes to the live carousel via `BroadcastChannel`.

## Unified Editor Multi-Select
- `Ctrl/Cmd + click`: toggle selection
- `Shift + click`: range select
- Bulk actions in sidebar:
  - Delete selected posters
  - Add category to selected posters
  - Remove category from selected posters

## API Overview
The Express server serves static files and exposes endpoints for editors:

- `GET /api/load-options` (categories + journeys)
- `GET /api/categories`
- `GET /api/posters-all`
- `GET /api/posters-in-category?category=...`
- `GET /api/posters-in-directory?directory=...` (legacy)
- `POST /api/posters-by-filenames`
- `GET /api/directories` (returns central poster directory)
- `GET /api/journeys` / `GET /api/journey/:filename`
- `POST /api/save-poster` / `POST /api/save-image` / `POST /api/save-file`
- `POST /api/create-images-directory`
- `DELETE /api/delete-poster?path=...` (preferred)
- `POST /api/delete-poster` (compatibility)
- `POST /api/delete-category` (removes from config and all posters; applies `No-Category` fallback when needed)
- `POST /api/delete-journey`

### Model Intel Endpoints

These endpoints use `@diffcommit/model-intel-core`:

- `POST /api/model-intel/normalize-openrouter`
- `POST /api/model-intel/capabilities`
- `POST /api/model-intel/benchmarks/parse-match`

PowerShell quick tests:

```powershell
# Normalize an OpenRouter model payload
curl -Method POST "http://localhost:3010/api/model-intel/normalize-openrouter" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"model":{"id":"anthropic/claude-haiku-4.5","name":"Claude Haiku 4.5","context_length":200000,"pricing":{"prompt":"0.000001","completion":"0.000005"},"architecture":{"modality":"text->text"},"supported_parameters":["tools"],"capabilities":["search"]}}'

# Evaluate capability flags
curl -Method POST "http://localhost:3010/api/model-intel/capabilities" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"modelId":"perplexity/sonar-pro","modelName":"Sonar Pro","modality":"text->text","supportedParams":["tools"],"capabilities":["search"]}'

# Parse benchmarks and attempt a match
curl -Method POST "http://localhost:3010/api/model-intel/benchmarks/parse-match" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"modelId":"anthropic/claude-haiku-4.5","modelName":"Claude Haiku 4.5","rawBenchmarks":{"data":[{"model_name":"Claude Haiku 4.5","model_creator":{"name":"Anthropic"},"evaluations":{"artificial_analysis_intelligence_index":52.1}}]}}'
```

## Browser Support Notes
Scroll-driven animations require `animation-timeline: scroll()` support. Chromium-based browsers support this, and Firefox supports it with the `layout.css.scroll-driven-animations.enabled` flag. If unsupported, a notice is shown at the bottom of the page.

## Tips
- Use Shift + click (or Shift + Enter) on the centered poster to open the full article view.
- Only the centered poster is interactive; others ignore flip/open actions.
- The number of posters controls the scroll length via the `--n` CSS variable.

## License
ISC (see `package.json`).
