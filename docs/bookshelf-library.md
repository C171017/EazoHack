# Paper bookshelf library

The library is a single horizontal shelf in the reader's existing paper texture and ink color. Six SVG binding patterns, deterministic height/width/lean variations, and a small emblem distinguish the spines. Titles fit their available space; Chinese titles read vertically from top to bottom. The active book carries an outline bookmark.

Click an empty space, choose a TXT or PDF, and enter the title for its spine. The uploaded book occupies that space. The shelf initially fills its viewport and grows beyond it only when needed, always retaining an empty space at its end. Trackpad, touch, mouse wheel, keyboard, and overflow arrow controls support horizontal browsing.

The IndexedDB catalogue stores each book's slot, binding variant, and optional emblem independently of its source data. Legacy entries acquire positions in place. Duplicate uploads and PDF-to-text conversion retain the book's existing position and emblem; simultaneous placement resolves collisions inside the transaction.

## Book illustrations

- New uploads call `/api/book-emblem` in the background using the configured Gemini analysis provider (default `gemini-3.8-flash`). Five distributed excerpts, at most about 10,000 characters altogether, supply context. This is a lightweight illustration step, not a claim of full-book graph analysis.
- The complete `analyzeText` pipeline also generates an emblem from summaries of every analyzed section. Its `book-emblem` checkpoint follows the existing validation/retry/cache workflow, and `Graph.bookEmblem` reaches the library through the map bootstrap.
- The model returns a label and bounded SVG path data. React renders those paths with a fixed viewBox and monochrome stroke. No model-supplied SVG markup, scripts, colors, or external resources are injected.
- Emblems are saved and reused. Uploads remain readable while the request runs or if it fails; a deterministic classic emblem provides the fallback.

## Validation

179 tests passed, including shelf persistence, legacy migration, concurrent placement, duplicate uploads, PDF conversion, unsafe emblem rejection, and analysis checkpoint reuse. TypeScript and targeted ESLint checks passed.

An isolated production build passed using the project's existing cached Google Font CSS and font files through Next's font test harness; live font fetching was unavailable. Browser checks on that build verified TXT and PDF uploads, custom English and Chinese titles, placement in the chosen space, reading navigation, persistence after reload, real Gemini-generated emblems, viewport-width empty shelves, overflow after placing a book at the edge, and phone-size horizontal navigation. Test uploads used a separate local origin and did not enter the user's main library.
