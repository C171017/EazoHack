# Source-preserving reader formatting

The reader derives presentation ranges from the immutable TXT source. Formatting
does not change extraction versions, source hashes, saved positions, or anchors.
Every UTF-16 character belongs to exactly one range, including trailing whitespace.

Already paragraph-separated TXT retains its existing formatting rules. Dense
extracted passages additionally use surviving lines to identify:

- Contents entries, wrapped titles, part/chapter groups, and trailing page references.
- Edge folios and spaced running heads, displayed quietly rather than removed.
- Explicit headings and short title-case headings with surrounding prose evidence.
- Individual wrapped list items and short sentence-ending lines suggesting paragraphs.
- Short opening title pages, with the book title separated from edition/author lines.

Contents detection requires at least five reference-ending lines, a reference-line
ratio of 28 percent, and a structural contents/chapter/numbered-section cue. Body
paragraph inference requires at least eight lines, a typical line length of at
least 55 characters, and a terminal line shorter than 82 percent of that length.
These are conservative heuristics, not confidence probabilities or universal
layout recovery. Uncertain text remains in source order. No model is called.

The renderer keeps reference numbers inside the source DOM range while styling
them in a separate column. Highlight segments are rendered inside that number
wrapper so partial selections do not create overlapping positioned numbers.

Validation: synthetic extracted-page cases, existing Republic formatting tests,
source-anchor/highlight/selection tests, and local Economics ninth-edition source
coverage (4,512,293 characters). Live browser checks covered contents rows,
preface headings and bullets, and selection opening the enhancement picker.

Known limits: plain text cannot reliably recover multi-column order, embedded
sample-page boundaries, chart/table geometry, or paragraph boundaries whose
line/spacing evidence has been lost. Economics preface sample-page content is a
concrete example. Layout-assisted reconstruction from the retained PDF is a
separate decision; this change neither reorders those passages nor removes them.
Line-end hyphens remain source text rather than being guessed away.
