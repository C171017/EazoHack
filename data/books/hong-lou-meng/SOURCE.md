# 红楼梦 — Chinese example source record

Acquired 2026-09-06. The default Chinese example contains all 120 chapters.

## Reading text

- Work: 红楼梦 / Dream of the Red Chamber. Cao Xueqin; later 120-chapter editorial tradition associated with Cheng Weiyuan and Gao E. Authorship of the continuation is disputed.
- Source: https://zh.wikisource.org/zh-hans/紅樓夢
- Edition: Wikisource's collated text, first 80 chapters based on the Gengchen manuscript and final 40 on the Chengjia edition, as described on its index page. Simplified Chinese presentation.
- `raw/hong-lou-meng-wikisource-120.txt`: all chapter bodies in order, extracted from the frozen HTML snapshots. No browser chrome, chapter-navigation links, or editorial footnote markers/notes. Original prose and verse remain; this is not an abridgment.
- `raw/wikisource/*.html.gz`: unchanged downloaded HTML, compressed losslessly. Revisions, URLs and HTML hashes are in `source-manifest.json`.
- `derived/hong-lou-meng-reading.txt`: the exact frozen text served by the reader. Hash it independently for passage anchors; do not reuse anchors from another edition.
- Rebuild offline: `python3 scripts/prepare-chinese-sample.py`. Add `--download` only to acquire missing snapshots. Review any new source before replacing the frozen edition.
- Original literary work: public domain, as identified by Wikisource. Site contributions: CC BY-SA 4.0 where applicable (https://creativecommons.org/licenses/by-sa/4.0/); attribution to Wikisource contributors through the chapter URLs/revisions in the manifest. Changes: HTML-to-TXT extraction, omission of editorial footnotes/navigation, normalization of paragraph/verse whitespace. Preserve attribution and applicable share-alike terms when redistributing this transcription.
- Gutenberg #24264 was inspected but rejected for the default reader because it contains visible corrupted characters and a repeated chapter 45 heading. It is not the active text.

## Reference PDF

- File: `source/hong-lou-meng-chengyi-1792.pdf`.
- Source: https://commons.wikimedia.org/wiki/File:紅樓夢_程乙本_原版_全集_萃文書屋活字_乾隆壬子.pdf
- Historical Chengyi edition, 1792, Tianjin Library copy, 120 chapters. The Commons description's standalone date field says 1763, but its title/caption identify the 1792 printing; preserve that discrepancy rather than treating 1763 as the printing date.
- 1,725 pages, 71,275,011 bytes. Scan retained unmodified. Commons marks it public domain / PD-scan.
- Visual checks: contents on PDF page 40 and chapter 120 ending on PDF page 1724. This is a reference scan, not the source of the reader's text, and no page-to-passage correspondence is asserted. Do not route it through automatic OCR.
- This PDF differs from the collated reading edition. It is stored as a project reference and is not included in the reader's initial payload.

## SHA-256

| File | SHA-256 |
| --- | --- |
| `raw/hong-lou-meng-wikisource-120.txt` | `5a40522fd3dd9d2395daed07a78b57d174b05ee9c4e09e3b8864722ff685572f` |
| `derived/hong-lou-meng-reading.txt` | `5a40522fd3dd9d2395daed07a78b57d174b05ee9c4e09e3b8864722ff685572f` |
| `source/hong-lou-meng-chengyi-1792.pdf` | `2e2e4d59f8a17d46a56b5cf4debace8b2e2cc740168884c7e7ccfbf68ac6b768` |
