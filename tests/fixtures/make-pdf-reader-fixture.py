"""Generate a synthetic, redistributable PDF for manual browser QA. Requires reportlab/Pillow."""
import io
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

output = Path(sys.argv[1])
output.parent.mkdir(parents=True, exist_ok=True)
font_path = sys.argv[2] if len(sys.argv) > 2 else '/System/Library/Fonts/Supplemental/Arial.ttf'
font = ImageFont.truetype(font_path, 46)

def scan(lines):
    image = Image.new('RGB', (1200, 1600), 'white')
    draw = ImageDraw.Draw(image)
    for i, line in enumerate(lines):
        draw.text((90, 130 + i * 90), line, font=font, fill='black')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    buffer.seek(0)
    return ImageReader(buffer)

c = canvas.Canvas(str(output), pagesize=(600, 800), pageCompression=1)
c.setTitle('Eazo PDF reader verification fixture')
c.setFont('Helvetica', 22)
for i, line in enumerate(['Embedded text page', 'Exact source words remain selectable.', 'The next page is an image scan.']):
    c.drawString(45, 735 - i * 45, line)
c.showPage()
c.drawImage(scan(['Scanned image page', 'Local recognition makes words selectable.', 'This page has no embedded text.']), 0, 0, width=600, height=800)
c.showPage()
c.drawImage(scan(['Damaged hidden text page', 'The visible words must survive recognition.', 'Repair only this page with local OCR.']), 0, 0, width=600, height=800)
t = c.beginText(45, 735)
t.setFont('Helvetica', 16)
t.setTextRenderMode(3)
for _ in range(8):
    t.textLine('TheseWordsAreIntentionallyJoinedWithoutAnySpacesForTesting')
c.drawText(t)
c.showPage()
c.setFont('Helvetica', 20)
c.drawString(45, 750, 'Two columns and headings')
c.setFont('Helvetica', 12)
for i in range(8):
    c.drawString(45, 700-i*35, f'Left column sentence {i+1}.')
    c.drawString(375, 700-i*35, f'Right note {i+1}.')
c.showPage()
c.setPageRotation(90)
c.setFont('Helvetica', 20)
c.drawString(45, 520, 'Rotated page with embedded text.')
c.drawString(45, 480, 'Highlights must map back to the page.')
c.showPage()
c.save()
print(output)
