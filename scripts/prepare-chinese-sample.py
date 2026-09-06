"""Download/rebuild the 120-chapter Wikisource sample with frozen source snapshots.
Run with --download to acquire HTML; otherwise rebuild from the local gzip snapshots.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
import gzip, hashlib, json, re, sys, time

root = Path(__file__).resolve().parents[1] / 'data/books/hong-lou-meng'
snapshots = root / 'raw/wikisource'
snapshots.mkdir(parents=True, exist_ok=True)
class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('sup', 'style', 'script'): self.skip += 1
        if not self.skip and tag == 'br': self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('sup', 'style', 'script'): self.skip -= 1
        if not self.skip and tag in ('p', 'div', 'center'): self.parts.append('\n\n')
    def handle_data(self, data):
        if not self.skip: self.parts.append(data.replace('\n', ''))

def chapter(n):
    url = 'https://zh.wikisource.org/zh-hans/' + quote(f'紅樓夢/第{n:03}回')
    file = snapshots / f'{n:03}.html.gz'
    if not file.exists():
        if '--download' not in sys.argv: raise ValueError(f'Missing snapshot: {file}')
        for attempt in range(4):
            try:
                with urlopen(Request(url, headers={'User-Agent': 'EazoBookSource/1.0 (public domain reading sample)'}), timeout=60) as response: html = response.read()
                file.write_bytes(gzip.compress(html, mtime=0)); break
            except Exception:
                if attempt == 3: raise
                time.sleep(2 ** (attempt + 1))
    html = gzip.decompress(file.read_bytes()).decode('utf-8')
    content = html[html.index('id="mw-content-text"'):]
    start = re.search(r'<b>第', content)
    if not start: raise ValueError(f'Chapter {n}: missing title')
    content = content[start.start():]
    end = re.search(r'<(?:hr\b|div class="mw-heading|div class="printfooter)', content)
    if not end: raise ValueError(f'Chapter {n}: missing end boundary')
    parser = Text(); parser.feed(content[:end.start()])
    text = re.sub(r'\n{3,}', '\n\n', ''.join(parser.parts)).strip()
    if len(text) < 1000 or not text.startswith('第'): raise ValueError(f'Chapter {n}: incomplete source')
    revision = re.search(r'"wgRevisionId":(\d+)', html)
    print(f'Chapter {n:03}: {len(text)} characters', flush=True)
    return text, {'chapter': n, 'url': url, 'revision': int(revision[1]) if revision else None, 'htmlSha256': hashlib.sha256(html.encode()).hexdigest(), 'characters': len(text)}

with ThreadPoolExecutor(max_workers=4) as pool: chapters = list(pool.map(chapter, range(1,121)))
text = '\n\n'.join(c[0] for c in chapters) + '\n'
(root / 'derived').mkdir(exist_ok=True)
(root / 'raw/hong-lou-meng-wikisource-120.txt').write_text(text, encoding='utf-8')
(root / 'derived/hong-lou-meng-reading.txt').write_text(text, encoding='utf-8')
(root / 'source-manifest.json').write_text(json.dumps({'source':'Wikisource zh-Hans', 'chapters':[c[1] for c in chapters], 'sha256':hashlib.sha256(text.encode()).hexdigest()}, ensure_ascii=False, indent=2)+'\n')
print(f'Prepared {len(chapters)} chapters, {len(text)} characters.')
