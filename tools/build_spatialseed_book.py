from __future__ import annotations

import html
import hashlib
import io
import math
import re
import textwrap
from pathlib import Path

from PIL import Image as PILImage
from pypdf import PdfReader, PdfWriter
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    XPreformatted,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parent.parent
MANUSCRIPT = ROOT / "docs" / "book" / "SpatialSeed_Livro_Manual_v0.6.md"
TMP = ROOT / "tmp" / "pdfs"
OUT = ROOT / "docs" / "book" / "SpatialSeed_Livro_Manual_e_Atlas_Procedural_v0.6.pdf"
BASE_PDF = TMP / "SpatialSeed_v0.6_base.pdf"
TMP.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)

# Resolved design system: narrative_proposal preset with named
# SpatialSeed Editorial overrides for glyph coverage and chapter art.
PAGE_W, PAGE_H = LETTER
MARGIN = 0.82 * inch
CONTENT_W = PAGE_W - 2 * MARGIN
CONTENT_H = PAGE_H - 2 * MARGIN
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
FONT_REGULAR = "DejaVuSans"
FONT_BOLD = "DejaVuSans-Bold"
FONT_ITALIC = "DejaVuSans-Oblique"
FONT_MONO = "DejaVuSansMono"
FONT_MONO_BOLD = "DejaVuSansMono-Bold"

NAVY = HexColor("#0A1D2B")
NAVY_2 = HexColor("#102A3D")
INK = HexColor("#17212B")
MUTED = HexColor("#586A78")
BLUE = HexColor("#5B8BD9")
CORAL = HexColor("#D98067")
GREEN = HexColor("#72B883")
TEAL = HexColor("#1BAFA7")
GOLD = HexColor("#D9A62E")
VIOLET = HexColor("#8B6ED1")
PAPER = HexColor("#F7F6F1")
PALE_BLUE = HexColor("#E8F0F7")
PALE_TEAL = HexColor("#E5F4F2")
PALE_CORAL = HexColor("#F7EAE5")
LIGHT = HexColor("#EEF1F3")
WHITE = colors.white

PART_META = {
    "PARTE I — POR QUE UM MUNDO PRECISA DE CONTRATOS": (
        "Fundamentos",
        "Identidade, autoridade, memória e a disciplina categorial que mantém interfaces diferentes sobre o mesmo mundo.",
        BLUE,
    ),
    "PARTE II — ARQUITETURA, SUBSISTEMAS E PAINÉIS": (
        "Arquitetura",
        "Camadas locais hoje, regiões distribuídas amanhã — sem confundir viewer, editor, sandbox e autoridade.",
        CORAL,
    ),
    "PARTE III — MANUAL DA LINGUAGEM E DA INTERFACE": (
        "Manual",
        "Comandos, gramática matemática, semântica indexada, AST, cor, projetos, diagnósticos e testes.",
        GOLD,
    ),
    "PARTE IV — GERAÇÃO PROCEDURAL: DA REGRA À CIDADE": (
        "Atlas procedural",
        "Quatro novos programas graduais e a Trindade Orbital: fórmulas, código, variações e validação.",
        GREEN,
    ),
    "PARTE V — PERFORMANCE, TESTES E HONESTIDADE EXPERIMENTAL": (
        "Evidência",
        "O que foi medido, o que falta medir e como separar custo lógico, fachada, recursos e experiência móvel.",
        TEAL,
    ),
    "PARTE VI — POSSIBILIDADES E ROTEIRO": (
        "Horizonte",
        "Assets procedurais, parâmetros, aparência, protótipos, regiões, diffs semânticos e múltiplos viewers.",
        VIOLET,
    ),
    "PARTE VII — TEMPO, EXPERIMENTOS E COLABORAÇÃO": (
        "Continuidade",
        "Laboratórios declarativos, animação efêmera, ações configuráveis e um método verificável de colaboração com LLMs.",
        CORAL,
    ),
    "APÊNDICES": (
        "Referência",
        "Comandos, matemática, programas executáveis, fontes, limites e checklist de reprodução.",
        BLUE,
    ),
}


def register_fonts():
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(FONT_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONT_DIR / "DejaVuSans-Bold.ttf")))
    # The minimal container does not ship DejaVu Sans Oblique.  Register the
    # regular face under the italic family alias so ReportLab keeps the full
    # Unicode coverage instead of falling back to Helvetica.
    pdfmetrics.registerFont(TTFont(FONT_ITALIC, str(FONT_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_MONO, str(FONT_DIR / "DejaVuSansMono.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_MONO_BOLD, str(FONT_DIR / "DejaVuSansMono-Bold.ttf")))
    pdfmetrics.registerFontFamily(
        FONT_REGULAR,
        normal=FONT_REGULAR,
        bold=FONT_BOLD,
        italic=FONT_ITALIC,
        boldItalic=FONT_BOLD,
    )


register_fonts()


def styles():
    sheet = getSampleStyleSheet()
    result = {}
    result["Body"] = ParagraphStyle(
        "Body",
        parent=sheet["BodyText"],
        fontName=FONT_REGULAR,
        fontSize=9.7,
        leading=13.2,
        textColor=INK,
        alignment=TA_JUSTIFY,
        spaceAfter=7,
        allowWidows=0,
        allowOrphans=0,
    )
    result["Lead"] = ParagraphStyle(
        "Lead",
        parent=result["Body"],
        fontSize=11.3,
        leading=15.3,
        textColor=NAVY_2,
        spaceAfter=12,
    )
    result["Chapter"] = ParagraphStyle(
        "Chapter",
        parent=sheet["Heading1"],
        fontName=FONT_BOLD,
        fontSize=20,
        leading=23,
        textColor=NAVY,
        spaceBefore=4,
        spaceAfter=14,
        keepWithNext=True,
    )
    result["H3"] = ParagraphStyle(
        "H3",
        parent=sheet["Heading2"],
        fontName=FONT_BOLD,
        fontSize=12.2,
        leading=15,
        textColor=TEAL,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True,
    )
    result["Quote"] = ParagraphStyle(
        "Quote",
        parent=result["Body"],
        fontName=FONT_ITALIC,
        fontSize=10.8,
        leading=15,
        leftIndent=16,
        rightIndent=12,
        borderColor=TEAL,
        borderWidth=2.5,
        borderPadding=(8, 10, 8, 12),
        backColor=PALE_TEAL,
        textColor=NAVY_2,
        spaceBefore=8,
        spaceAfter=12,
    )
    result["Bullet"] = ParagraphStyle(
        "Bullet",
        parent=result["Body"],
        leftIndent=18,
        firstLineIndent=0,
        bulletIndent=2,
        spaceAfter=4,
        alignment=TA_LEFT,
    )
    result["Number"] = ParagraphStyle(
        "Number",
        parent=result["Body"],
        leftIndent=22,
        bulletIndent=2,
        spaceAfter=5,
        alignment=TA_LEFT,
    )
    result["Caption"] = ParagraphStyle(
        "Caption",
        parent=result["Body"],
        fontName=FONT_ITALIC,
        fontSize=7.9,
        leading=10.3,
        alignment=TA_CENTER,
        textColor=MUTED,
        spaceBefore=4,
        spaceAfter=11,
    )
    result["Code"] = ParagraphStyle(
        "Code",
        fontName=FONT_MONO,
        fontSize=6.6,
        leading=8.4,
        textColor=HexColor("#D9EBFA"),
        leftIndent=0,
        rightIndent=0,
        spaceBefore=0,
        spaceAfter=0,
    )
    result["CodeCaption"] = ParagraphStyle(
        "CodeCaption",
        parent=result["H3"],
        fontSize=9.7,
        leading=12,
        textColor=NAVY_2,
        spaceBefore=8,
        spaceAfter=5,
    )
    result["Table"] = ParagraphStyle(
        "Table",
        parent=result["Body"],
        fontSize=7.6,
        leading=9.5,
        alignment=TA_LEFT,
        spaceAfter=0,
    )
    result["TableHeader"] = ParagraphStyle(
        "TableHeader",
        parent=result["Table"],
        fontName=FONT_BOLD,
        textColor=WHITE,
    )
    result["TOC0"] = ParagraphStyle(
        "TOC0",
        fontName=FONT_BOLD,
        fontSize=11,
        leading=14,
        leftIndent=0,
        firstLineIndent=0,
        textColor=NAVY,
        spaceBefore=6,
    )
    result["TOC1"] = ParagraphStyle(
        "TOC1",
        fontName=FONT_REGULAR,
        fontSize=8.7,
        leading=11.3,
        leftIndent=16,
        firstLineIndent=-8,
        textColor=INK,
    )
    result["Small"] = ParagraphStyle(
        "Small",
        parent=result["Body"],
        fontSize=8.2,
        leading=10.8,
        textColor=MUTED,
        alignment=TA_LEFT,
    )
    result["Equation"] = ParagraphStyle(
        "Equation",
        parent=result["Body"],
        fontName=FONT_MONO,
        fontSize=10.2,
        leading=14,
        alignment=TA_CENTER,
        textColor=NAVY_2,
        backColor=PALE_BLUE,
        borderPadding=7,
        spaceBefore=6,
        spaceAfter=10,
    )
    return result


STYLES = styles()


class BookDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            MARGIN,
            MARGIN,
            CONTENT_W,
            CONTENT_H,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates([
            PageTemplate(id="book", frames=[frame], onPage=draw_page),
        ])

    def afterFlowable(self, flowable):
        title = None
        level = None
        if isinstance(flowable, PartDivider):
            title = flowable.title
            level = 0
        elif isinstance(flowable, Paragraph) and flowable.style.name == "Chapter":
            title = flowable.getPlainText()
            level = 1
            # The generated table-of-contents heading precedes the first Part
            # divider, so it is intentionally not itself an outline/TOC entry.
            if title == "Sumário":
                return
        if title is None:
            return
        # The same story is laid out repeatedly by ``multiBuild`` until the
        # TOC stabilizes.  Bookmark ids therefore must be deterministic across
        # passes (a mutable counter prevents convergence).
        digest = hashlib.sha1(f"{level}:{title}".encode("utf-8")).hexdigest()[:14]
        key = f"bookmark-{level}-{digest}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(title, key, level=level, closed=False)
        self.notify("TOCEntry", (level, title, self.page, key))


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    if doc.page > 1:
        canvas.setStrokeColor(HexColor("#D7DEE3"))
        canvas.setLineWidth(0.45)
        canvas.line(MARGIN, PAGE_H - 0.48 * inch, PAGE_W - MARGIN, PAGE_H - 0.48 * inch)
        canvas.setFont(FONT_BOLD, 6.8)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, PAGE_H - 0.39 * inch, "SPATIALSEED · LIVRO, MANUAL E ATLAS PROCEDURAL · V0.6")
        canvas.setFont(FONT_REGULAR, 7.2)
        canvas.drawRightString(PAGE_W - MARGIN, 0.39 * inch, str(doc.page))
    canvas.restoreState()


class CoverPage(Flowable):
    def __init__(self, image_path):
        super().__init__()
        self.image_path = str(image_path)
        self.width = CONTENT_W
        self.height = CONTENT_H - 1

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        self.height = availHeight - 1
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(NAVY)
        c.rect(-MARGIN, -MARGIN, PAGE_W, PAGE_H, fill=1, stroke=0)
        image = ImageReader(self.image_path)
        iw, ih = image.getSize()
        target_w = PAGE_W
        target_h = PAGE_H * 0.69
        scale = max(target_w / iw, target_h / ih)
        dw, dh = iw * scale, ih * scale
        dx = -MARGIN + (PAGE_W - dw) / 2
        dy = self.height + MARGIN - target_h + (target_h - dh) / 2
        c.drawImage(image, dx, dy, dw, dh, mask="auto")
        c.setFillColor(HexColor("#07131F"))
        c.rect(-MARGIN, -MARGIN, PAGE_W, PAGE_H * 0.37, fill=1, stroke=0)
        c.setFillColor(TEAL)
        c.roundRect(-MARGIN + 0.72 * inch, PAGE_H * 0.31 - MARGIN, 1.55 * inch, 0.28 * inch, 0.14 * inch, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 8.6)
        c.drawCentredString(-MARGIN + 1.495 * inch, PAGE_H * 0.31 - MARGIN + 0.09 * inch, "EDIÇÃO 0.6")
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 29)
        c.drawString(-MARGIN + 0.72 * inch, PAGE_H * 0.25 - MARGIN, "SPATIALSEED")
        c.setFont(FONT_REGULAR, 14)
        c.setFillColor(HexColor("#C6D8E6"))
        c.drawString(-MARGIN + 0.73 * inch, PAGE_H * 0.205 - MARGIN, "Livro, manual da linguagem e atlas procedural")
        c.setFont(FONT_REGULAR, 9.4)
        c.setFillColor(HexColor("#8FA8BA"))
        c.drawString(-MARGIN + 0.73 * inch, PAGE_H * 0.155 - MARGIN, "Arquitetura · categorias · AST · cores · cidade · obras reproduzíveis")
        c.setFont(FONT_BOLD, 10)
        c.setFillColor(WHITE)
        c.drawString(-MARGIN + 0.73 * inch, PAGE_H * 0.09 - MARGIN, "Rogério Duarte")
        c.setFont(FONT_REGULAR, 7.8)
        c.setFillColor(HexColor("#8FA8BA"))
        c.drawRightString(PAGE_W - MARGIN - 0.02 * inch, PAGE_H * 0.09 - MARGIN, "24 de julho de 2026 · commit b4043c6")
        c.restoreState()


class PartDivider(Flowable):
    def __init__(self, title):
        super().__init__()
        self.title = title
        self.kicker, self.subtitle, self.accent = PART_META.get(title, ("Parte", "", BLUE))
        self.width = CONTENT_W
        self.height = CONTENT_H - 1

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        self.height = availHeight - 1
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(NAVY)
        c.rect(-MARGIN, -MARGIN, PAGE_W, PAGE_H, fill=1, stroke=0)
        # Procedural constellation.
        c.setStrokeColor(self.accent)
        c.setLineWidth(0.8)
        for ring in range(5):
            radius = (0.68 + ring * 0.34) * inch
            c.circle(self.width * 0.79, self.height * 0.62, radius, fill=0, stroke=1)
        c.setFillColor(self.accent)
        for index in range(22):
            angle = index * math.pi * 2 / 22
            radius = (0.7 + 0.032 * index) * inch
            x = self.width * 0.79 + math.cos(angle * 3) * radius
            y = self.height * 0.62 + math.sin(angle * 2) * radius
            size = 2.8 + (index % 4)
            c.rect(x - size / 2, y - size / 2, size, size, fill=1, stroke=0)
        c.setFillColor(self.accent)
        c.roundRect(0, self.height * 0.77, 1.35 * inch, 0.28 * inch, 0.14 * inch, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 8.4)
        c.drawCentredString(0.675 * inch, self.height * 0.77 + 0.09 * inch, self.kicker.upper())
        clean = self.title.split("—", 1)[-1].strip() if "—" in self.title else self.title
        p = Paragraph(
            inline_markup(clean),
            ParagraphStyle(
                "PartTitle",
                fontName=FONT_BOLD,
                fontSize=25,
                leading=30,
                textColor=WHITE,
                alignment=TA_LEFT,
            ),
        )
        pw, ph = p.wrap(self.width * 0.64, 2.1 * inch)
        p.drawOn(c, 0, self.height * 0.55)
        sp = Paragraph(
            html.escape(self.subtitle),
            ParagraphStyle(
                "PartSubtitle",
                fontName=FONT_REGULAR,
                fontSize=10.5,
                leading=15,
                textColor=HexColor("#B6CAD8"),
            ),
        )
        sp.wrap(self.width * 0.62, 1.5 * inch)
        sp.drawOn(c, 0, self.height * 0.39)
        c.setFillColor(HexColor("#8FA8BA"))
        c.setFont(FONT_MONO, 7.5)
        c.drawString(0, 0.14 * inch, "main · b4043c6 · build 20260720-0028e")
        c.restoreState()


class CroppedImage(Flowable):
    def __init__(self, path, crop, width, height):
        super().__init__()
        self.path = str(ROOT / path) if not Path(path).is_absolute() else str(path)
        self.crop = tuple(float(value) for value in crop.split(","))
        self.width = width
        self.height = height
        self._reader = ImageReader(self.path)
        self.iw, self.ih = self._reader.getSize()

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        left, top, right, bottom = self.crop
        crop_w = max(1, (right - left) * self.iw)
        crop_h = max(1, (bottom - top) * self.ih)
        scale = max(self.width / crop_w, self.height / crop_h)
        rendered_crop_w = crop_w * scale
        rendered_crop_h = crop_h * scale
        x = -left * self.iw * scale - (rendered_crop_w - self.width) / 2
        y = -(1 - bottom) * self.ih * scale - (rendered_crop_h - self.height) / 2
        c = self.canv
        c.saveState()
        path = c.beginPath()
        path.rect(0, 0, self.width, self.height)
        c.clipPath(path, stroke=0, fill=0)
        c.drawImage(self._reader, x, y, self.iw * scale, self.ih * scale, mask="auto")
        c.restoreState()
        c.setStrokeColor(HexColor("#C7D1D8"))
        c.setLineWidth(0.5)
        c.rect(0, 0, self.width, self.height, fill=0, stroke=1)


def inline_markup(text: str) -> str:
    pattern = re.compile(
        r"(\[[^\]]+\]\(https?://[^)]+\)|\*\*.+?\*\*|`.+?`|\*[^*]+?\*)"
    )
    out = []
    for piece in pattern.split(text):
        if not piece:
            continue
        link = re.fullmatch(r"\[([^\]]+)\]\((https?://[^)]+)\)", piece)
        if link:
            label, url = link.groups()
            out.append(f'<link href="{html.escape(url, quote=True)}" color="#2E74B5"><u>{html.escape(label)}</u></link>')
        elif piece.startswith("**") and piece.endswith("**"):
            out.append(f"<b>{html.escape(piece[2:-2])}</b>")
        elif piece.startswith("`") and piece.endswith("`"):
            out.append(f'<font name="{FONT_MONO}" color="#1F5A7A">{html.escape(piece[1:-1])}</font>')
        elif piece.startswith("*") and piece.endswith("*"):
            out.append(f"<i>{html.escape(piece[1:-1])}</i>")
        else:
            out.append(html.escape(piece))
    return "".join(out)


def add_chapter_title(title):
    # Colored eyebrow plus title keeps chapter openings visually consistent.
    number_match = re.match(r"([^—]+)—\s*(.+)", title)
    if number_match:
        prefix, clean = number_match.groups()
        eyebrow = Paragraph(
            f'<font color="#1BAFA7"><b>{html.escape(prefix.strip())}</b></font>',
            ParagraphStyle(
                "Eyebrow",
                fontName=FONT_BOLD,
                fontSize=7.8,
                leading=9,
                spaceAfter=3,
                textTransform="uppercase",
            ),
        )
        chapter = Paragraph(inline_markup(clean.strip()), STYLES["Chapter"])
        return [eyebrow, chapter]
    return [Paragraph(inline_markup(title), STYLES["Chapter"])]


def figure(path, caption, width_inches):
    image_path = ROOT / path
    with PILImage.open(image_path) as img:
        iw, ih = img.size
    width = min(float(width_inches) * inch, CONTENT_W)
    height = width * ih / iw
    if height > CONTENT_H * 0.72:
        height = CONTENT_H * 0.72
        width = height * iw / ih
    img = Image(str(image_path), width=width, height=height)
    img.hAlign = "CENTER"
    cap = Paragraph(inline_markup(caption), STYLES["Caption"])
    return KeepTogether([img, cap])


def crop_pair(parts):
    _, path1, caption1, crop1, path2, caption2, crop2, height_in = parts
    gap = 0.16 * inch
    cell_w = (CONTENT_W - gap) / 2
    height = float(height_in) * inch
    img1 = CroppedImage(path1, crop1, cell_w, height)
    img2 = CroppedImage(path2, crop2, cell_w, height)
    cap1 = Paragraph(inline_markup(caption1), STYLES["Caption"])
    cap2 = Paragraph(inline_markup(caption2), STYLES["Caption"])
    table = Table(
        [[img1, img2], [cap1, cap2]],
        colWidths=[cell_w, cell_w],
        hAlign="CENTER",
        splitByRow=0,
    )
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), gap/2),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,0), 4),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    return table


def qr_block(url, description):
    qr = QrCodeWidget(url)
    x1, y1, x2, y2 = qr.getBounds()
    size = 1.35 * inch
    scale = size / max(x2 - x1, y2 - y1)
    drawing = Drawing(size, size, transform=[scale, 0, 0, scale, 0, 0])
    drawing.add(qr)
    text = Paragraph(
        f'<b>Experiência pública</b><br/>{inline_markup(description)}<br/><br/>'
        f'<link href="{html.escape(url, quote=True)}" color="#2E74B5"><u>abrir SpatialSeed no GitHub Pages</u></link>',
        STYLES["Lead"],
    )
    table = Table([[drawing, text]], colWidths=[1.58*inch, CONTENT_W-1.58*inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), PALE_BLUE),
        ("BOX", (0,0), (-1,-1), 0.8, BLUE),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ]))
    return table


def pretty_code(text: str, width=92):
    def expand_quoted(match):
        expression = match.group(1)
        expression = re.sub(r"([+\-*/%])", r" \1 ", expression)
        expression = re.sub(r"\s+", " ", expression).strip()
        return f'"{expression}"'

    lines = []
    for raw in text.strip().splitlines():
        expanded = re.sub(r'"([^"]*)"', expand_quoted, raw)
        wrapped = textwrap.wrap(
            expanded,
            width=width,
            subsequent_indent="    ↳ ",
            break_long_words=False,
            break_on_hyphens=False,
        ) or [""]
        lines.extend(wrapped)
    return "\n".join(lines)


def code_block(text, caption=None):
    pretty = pretty_code(text)
    pre = XPreformatted(html.escape(pretty), STYLES["Code"])
    table = Table([[pre]], colWidths=[CONTENT_W], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("BOX", (0,0), (-1,-1), 0.7, HexColor("#27465D")),
        ("LEFTPADDING", (0,0), (-1,-1), 9),
        ("RIGHTPADDING", (0,0), (-1,-1), 9),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    flowables = []
    if caption:
        flowables.append(Paragraph(inline_markup(caption), STYLES["CodeCaption"]))
    flowables.append(table)
    flowables.append(Spacer(1, 8))
    return flowables


def program_listing(path, title):
    source = (ROOT / path).read_text(encoding="utf-8").strip().splitlines()
    rows = []
    for index, command in enumerate(source, 1):
        pretty = pretty_code(command, width=94)
        pre = XPreformatted(html.escape(pretty), STYLES["Code"])
        marker = Paragraph(
            f'<font color="#72B883"><b>{index:02d}</b></font>',
            ParagraphStyle("CodeMarker", fontName=FONT_MONO_BOLD, fontSize=6.8, leading=8.4),
        )
        rows.append([marker, pre])
    table = Table(rows, colWidths=[0.35*inch, CONTENT_W-0.35*inch], repeatRows=0, splitByRow=1)
    commands = [
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("BOX", (0,0), (-1,-1), 0.7, HexColor("#27465D")),
        ("INNERGRID", (0,0), (-1,-1), 0.25, HexColor("#1B3549")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]
    for row in range(len(rows)):
        if row % 2:
            commands.append(("BACKGROUND", (0,row), (-1,row), HexColor("#0E2435")))
    table.setStyle(TableStyle(commands))
    note = Paragraph(
        "Listagem integral. As setas ↳ indicam apenas quebra visual da linha; para executar, use o arquivo textual anexado ao PDF.",
        STYLES["Small"],
    )
    return [Paragraph(inline_markup(title), STYLES["CodeCaption"]), note, table, Spacer(1, 10)]


def markdown_table(lines):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append(cells)
    if len(rows) >= 2 and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in rows[1]):
        rows.pop(1)
    cols = max(len(row) for row in rows)
    rows = [row + [""] * (cols - len(row)) for row in rows]
    max_lengths = []
    for col in range(cols):
        length = max(5, min(36, max(len(re.sub(r"[*`]", "", row[col])) for row in rows)))
        max_lengths.append(length)
    total = sum(max_lengths)
    widths = [CONTENT_W * length / total for length in max_lengths]
    # Keep first label column readable and numeric multi-column tables balanced.
    if cols == 2:
        widths = [CONTENT_W * 0.31, CONTENT_W * 0.69]
    elif cols >= 5:
        widths = [CONTENT_W / cols] * cols
    data = []
    for r_index, row in enumerate(rows):
        style = STYLES["TableHeader"] if r_index == 0 else STYLES["Table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    commands = [
        ("BACKGROUND", (0,0), (-1,0), NAVY_2),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("BOX", (0,0), (-1,-1), 0.65, HexColor("#AEBCC6")),
        ("INNERGRID", (0,0), (-1,-1), 0.35, HexColor("#CBD4DA")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]
    for row in range(1, len(data)):
        commands.append(("BACKGROUND", (0,row), (-1,row), PAPER if row % 2 else LIGHT))
    table.setStyle(TableStyle(commands))
    return table


def make_toc():
    toc = TableOfContents()
    toc.levelStyles = [STYLES["TOC0"], STYLES["TOC1"]]
    title = Paragraph("Sumário", STYLES["Chapter"])
    lead = Paragraph(
        "O livro alterna fundamentos, manual operacional, atlas procedural e evidência. Os arquivos de código estão anexados ao PDF.",
        STYLES["Lead"],
    )
    return [title, lead, toc, PageBreak()]


def parse_manuscript():
    lines = MANUSCRIPT.read_text(encoding="utf-8").splitlines()
    story = [CoverPage(ROOT / "docs/book/assets/scene_roseta-tricromatica.png"), PageBreak()]
    story.extend(make_toc())
    i = 0
    after_part = False
    first_body_paragraph = True
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("# "):
            if story and not isinstance(story[-1], PageBreak):
                story.append(PageBreak())
            title = stripped[2:].strip()
            story.extend([PartDivider(title), PageBreak()])
            after_part = True
            first_body_paragraph = True
            i += 1
            continue
        if stripped.startswith("## "):
            if not after_part and story and not isinstance(story[-1], PageBreak):
                story.append(PageBreak())
            story.extend(add_chapter_title(stripped[3:].strip()))
            after_part = False
            first_body_paragraph = True
            i += 1
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:].strip()), STYLES["H3"]))
            first_body_paragraph = False
            i += 1
            continue
        if stripped.startswith("{{FIGURE:"):
            payload = stripped[len("{{FIGURE:"):-2]
            path, caption, width = payload.split("|", 2)
            story.append(figure(path, caption, width))
            first_body_paragraph = False
            i += 1
            continue
        if stripped.startswith("{{CROP_PAIR:"):
            payload = stripped[len("{{CROP_PAIR:"):-2]
            parts = ["CROP_PAIR"] + payload.split("|")
            story.append(crop_pair(parts))
            story.append(Spacer(1, 8))
            first_body_paragraph = False
            i += 1
            continue
        if stripped.startswith("{{QR:"):
            payload = stripped[len("{{QR:"):-2]
            url, description = payload.split("|", 1)
            story.append(qr_block(url, description))
            story.append(Spacer(1, 10))
            first_body_paragraph = False
            i += 1
            continue
        if stripped.startswith("{{PROGRAM:"):
            payload = stripped[len("{{PROGRAM:"):-2]
            path, title = payload.split("|", 1)
            story.extend(program_listing(path, title))
            first_body_paragraph = False
            i += 1
            continue
        if stripped == "{{PAGE_BREAK}}":
            story.append(PageBreak())
            i += 1
            continue
        if stripped.startswith("```"):
            caption = None
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            story.extend(code_block("\n".join(code_lines), caption))
            first_body_paragraph = False
            continue
        if stripped.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i])
                i += 1
            story.append(markdown_table(table_lines))
            story.append(Spacer(1, 9))
            first_body_paragraph = False
            continue
        if stripped.startswith("> "):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith("> "):
                quote_lines.append(lines[i].strip()[2:])
                i += 1
            story.append(Paragraph(inline_markup(" ".join(quote_lines)), STYLES["Quote"]))
            first_body_paragraph = False
            continue
        if re.match(r"^-\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^-\s+", lines[i].strip()):
                text = re.sub(r"^-\s+", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline_markup(text), STYLES["Bullet"]), leftIndent=12))
                i += 1
            story.append(ListFlowable(items, bulletType="bullet", start="circle", leftIndent=18, bulletFontName=FONT_REGULAR, bulletFontSize=7, bulletColor=TEAL, spaceAfter=8))
            first_body_paragraph = False
            continue
        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                text = re.sub(r"^\d+\.\s+", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline_markup(text), STYLES["Number"]), leftIndent=16))
                i += 1
            story.append(ListFlowable(items, bulletType="1", leftIndent=20, bulletFontName=FONT_BOLD, bulletFontSize=8, bulletColor=CORAL, spaceAfter=8))
            first_body_paragraph = False
            continue

        paragraph_lines = [stripped]
        i += 1
        while i < len(lines):
            candidate = lines[i].strip()
            if not candidate:
                i += 1
                break
            if (
                candidate.startswith("#")
                or candidate.startswith("{{")
                or candidate.startswith("```")
                or candidate.startswith("|")
                or candidate.startswith("> ")
                or re.match(r"^-\s+", candidate)
                or re.match(r"^\d+\.\s+", candidate)
            ):
                break
            paragraph_lines.append(candidate)
            i += 1
        paragraph_text = " ".join(paragraph_lines)
        # Standalone symbolic equations receive an equation panel.
        is_equation = (
            len(paragraph_text) < 115
            and any(symbol in paragraph_text for symbol in (" = ", "→", "Σ", "γ :", "𝒮", "𝒲"))
            and not paragraph_text.endswith(":")
        )
        style = STYLES["Equation"] if is_equation else (STYLES["Lead"] if first_body_paragraph else STYLES["Body"])
        story.append(Paragraph(inline_markup(paragraph_text), style))
        first_body_paragraph = False
    return story


def attach_sources(base_pdf, final_pdf):
    reader = PdfReader(str(base_pdf))
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    attachments = sorted((ROOT / "docs" / "book" / "examples").iterdir())
    for path in attachments:
        writer.add_attachment(path.name, path.read_bytes())
    writer.add_metadata({
        "/Title": "SpatialSeed — Livro, Manual da Linguagem e Atlas Procedural v0.6",
        "/Author": "Rogério Duarte; colaboração editorial e técnica: OpenAI Codex",
        "/Subject": "Arquitetura, teoria categorial, manual, geração procedural, exemplos e benchmarks",
        "/Keywords": "SpatialSeed, procedural, AST, affine, category theory, city, GitHub Pages, manual",
        "/CreationDate": "D:20260724000000-03'00'",
        "/ModDate": "D:20260724000000-03'00'",
    })
    with final_pdf.open("wb") as handle:
        writer.write(handle)


def build():
    story = parse_manuscript()
    doc = BookDocTemplate(
        str(BASE_PDF),
        pagesize=LETTER,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title="SpatialSeed — Livro, Manual da Linguagem e Atlas Procedural v0.6",
        author="Rogério Duarte",
        subject="Arquitetura verificável, manual da linguagem e obras procedurais reproduzíveis",
        invariant=1,
    )
    doc.multiBuild(story)
    attach_sources(BASE_PDF, OUT)
    print(OUT.resolve())


if __name__ == "__main__":
    build()
