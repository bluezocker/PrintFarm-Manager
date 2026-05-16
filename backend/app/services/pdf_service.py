"""
PDF-Rechnungs-Generator mit ReportLab.

Erzeugt eine DIN-A4 Rechnung mit:
- Firmenkopf inkl. Logo
- Empfänger-Adresse im Sichtfenster
- Rechnungsnummer, Datum, Leistungsdatum
- Positionstabelle mit Mengen, Einzelpreis, Summe
- MwSt-Aufschlüsselung pro Steuersatz
- Skonto- und Zahlungshinweis
- Bankverbindung & Footer
"""
import os
from pathlib import Path
from datetime import date as Date
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
)

from app.core.config import settings
from app.models import Invoice, Company


def _money(value: Optional[float]) -> str:
    if value is None:
        return "0,00 €"
    return f"{value:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _date(d: Optional[Date]) -> str:
    return d.strftime("%d.%m.%Y") if d else "—"


def generate_invoice_pdf(invoice: Invoice, company: Company, output_path: str) -> str:
    """Erzeugt eine PDF-Rechnung an `output_path` und gibt den Pfad zurück."""

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        topMargin=20 * mm, bottomMargin=20 * mm,
        leftMargin=25 * mm, rightMargin=20 * mm,
        title=f"Rechnung {invoice.invoice_number}",
        author=company.name or "PrintFarm",
    )

    styles = getSampleStyleSheet()
    style_small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=10)
    style_normal = ParagraphStyle("normal", parent=styles["Normal"], fontSize=10, leading=13)
    style_title = ParagraphStyle("title", parent=styles["Heading1"], fontSize=18, spaceAfter=6)
    style_right = ParagraphStyle("right", parent=style_normal, alignment=TA_RIGHT)
    style_footer = ParagraphStyle("footer", parent=styles["Normal"], fontSize=7,
                                  leading=9, textColor=colors.grey, alignment=TA_CENTER)

    story = []

    # ===== Kopfzeile: Logo links, Firmendaten rechts =====
    logo_cell = ""
    if company.logo_path:
        logo_full = Path(settings.UPLOAD_DIR) / company.logo_path
        if logo_full.exists():
            try:
                logo_cell = Image(str(logo_full), width=40 * mm, height=20 * mm, kind="proportional")
            except Exception:
                logo_cell = ""

    company_info_lines = [company.name or ""]
    if company.street:
        company_info_lines.append(company.street)
    if company.zip_code or company.city:
        company_info_lines.append(f"{company.zip_code or ''} {company.city or ''}".strip())
    if company.phone:
        company_info_lines.append(f"Tel: {company.phone}")
    if company.email:
        company_info_lines.append(company.email)
    if company.website:
        company_info_lines.append(company.website)

    company_info = Paragraph("<br/>".join(company_info_lines), style_small)

    header_table = Table(
        [[logo_cell or "", company_info]],
        colWidths=[60 * mm, 105 * mm],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10 * mm))

    # ===== Absender-Mini über Empfänger (im Sichtfenster) =====
    sender_mini = ""
    if company.name:
        addr_parts = [company.name]
        if company.street:
            addr_parts.append(company.street)
        if company.zip_code or company.city:
            addr_parts.append(f"{company.zip_code or ''} {company.city or ''}".strip())
        sender_mini = " · ".join(addr_parts)

    story.append(Paragraph(
        f'<font size="7"><u>{sender_mini}</u></font>', style_small,
    ))
    story.append(Spacer(1, 3 * mm))

    # ===== Empfänger-Block =====
    customer = invoice.customer
    addr_lines = []
    if customer.customer_type == "business" and customer.company_name:
        addr_lines.append(customer.company_name)
        full_name = f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        if full_name:
            addr_lines.append(f"z.Hd. {full_name}")
    else:
        full_name = f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        if full_name:
            addr_lines.append(full_name)
        elif customer.company_name:
            addr_lines.append(customer.company_name)
    if customer.street:
        addr_lines.append(customer.street)
    if customer.zip_code or customer.city:
        addr_lines.append(f"{customer.zip_code or ''} {customer.city or ''}".strip())
    if customer.country and customer.country.lower() not in ("deutschland", "germany"):
        addr_lines.append(customer.country)

    story.append(Paragraph("<br/>".join(addr_lines), style_normal))
    story.append(Spacer(1, 15 * mm))

    # ===== Titel + Meta-Block rechts =====
    title = Paragraph(f"<b>Rechnung {invoice.invoice_number}</b>", style_title)

    meta_rows = [
        ["Rechnungsnummer:", invoice.invoice_number],
        ["Rechnungsdatum:", _date(invoice.invoice_date)],
    ]
    if invoice.service_date:
        meta_rows.append(["Leistungsdatum:", _date(invoice.service_date)])
    if customer.id:
        meta_rows.append(["Kundennummer:", str(customer.id).zfill(4)])

    meta_table = Table(meta_rows, colWidths=[35 * mm, 30 * mm])
    meta_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
    ]))

    top_table = Table(
        [[title, meta_table]],
        colWidths=[100 * mm, 65 * mm],
    )
    top_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(top_table)
    story.append(Spacer(1, 5 * mm))

    # ===== Anrede / Intro-Text =====
    intro = invoice.intro_text or _default_intro(customer)
    story.append(Paragraph(intro, style_normal))
    story.append(Spacer(1, 5 * mm))

    # ===== Positionstabelle =====
    table_data = [["Pos.", "Beschreibung", "Menge", "Einheit", "Einzelpreis", "MwSt", "Gesamt"]]
    for item in invoice.items:
        table_data.append([
            str(item.position),
            Paragraph(item.description.replace("\n", "<br/>"), style_normal),
            f"{item.quantity:.2f}".rstrip("0").rstrip("."),
            item.unit or "Stk",
            _money(item.unit_price_net),
            f"{item.vat_rate:.0f}%",
            _money(item.line_total_net),
        ])

    items_table = Table(
        table_data,
        colWidths=[10 * mm, 70 * mm, 17 * mm, 13 * mm, 22 * mm, 13 * mm, 22 * mm],
        repeatRows=1,
    )
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#1f2937")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 4 * mm))

    # ===== Summen-Block (rechts) =====
    # MwSt nach Sätzen gruppieren
    vat_buckets = {}
    for item in invoice.items:
        rate = item.vat_rate or 0
        vat_buckets.setdefault(rate, {"net": 0, "vat": 0})
        vat_buckets[rate]["net"] += item.line_total_net or 0
        vat_buckets[rate]["vat"] += item.line_vat or 0

    summary_rows = [
        ["Zwischensumme (netto)", _money(invoice.subtotal_net)],
    ]
    for rate, b in sorted(vat_buckets.items()):
        summary_rows.append([f"MwSt {rate:.0f}% (auf {_money(b['net'])})", _money(b["vat"])])
    summary_rows.append(["Gesamtbetrag", _money(invoice.total_gross)])

    summary_table = Table(summary_rows, colWidths=[60 * mm, 30 * mm])
    summary_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.black),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, -1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 4),
    ]))

    summary_wrapper = Table(
        [["", summary_table]],
        colWidths=[75 * mm, 90 * mm],
    )
    summary_wrapper.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(summary_wrapper)
    story.append(Spacer(1, 6 * mm))

    # ===== Zahlungsbedingungen =====
    pay_lines = []
    if invoice.due_date:
        pay_lines.append(
            f"Bitte überweisen Sie den Gesamtbetrag bis zum <b>{_date(invoice.due_date)}</b> "
            f"auf das unten genannte Konto."
        )
    elif invoice.payment_terms_days:
        pay_lines.append(
            f"Zahlungsziel: <b>{invoice.payment_terms_days} Tage</b> ohne Abzug."
        )
    if invoice.skonto_percent and invoice.skonto_percent > 0:
        pay_lines.append(
            f"Bei Zahlung innerhalb von {invoice.skonto_days} Tagen gewähren wir "
            f"<b>{invoice.skonto_percent:.1f}% Skonto</b>."
        )
    if invoice.payment_method:
        pay_lines.append(f"Zahlungsweise: {invoice.payment_method}")

    if pay_lines:
        story.append(Paragraph("<br/>".join(pay_lines), style_normal))
        story.append(Spacer(1, 5 * mm))

    # ===== Abschluss-Text =====
    closing = invoice.closing_text or "Vielen Dank für Ihren Auftrag!"
    story.append(Paragraph(closing, style_normal))

    # ===== Footer mit Firmen-/Steuer-/Bankdaten =====
    footer_parts = []
    if company.name:
        footer_parts.append(f"<b>{company.name}</b>")
    if company.managing_director:
        footer_parts.append(f"Geschäftsführer: {company.managing_director}")
    if company.tax_number:
        footer_parts.append(f"St.-Nr.: {company.tax_number}")
    if company.vat_id:
        footer_parts.append(f"USt-IdNr.: {company.vat_id}")
    if company.trade_register:
        footer_parts.append(company.trade_register)

    bank_parts = []
    if company.bank_name:
        bank_parts.append(f"Bank: {company.bank_name}")
    if company.iban:
        bank_parts.append(f"IBAN: {company.iban}")
    if company.bic:
        bank_parts.append(f"BIC: {company.bic}")

    footer_lines = []
    if footer_parts:
        footer_lines.append(" · ".join(footer_parts))
    if bank_parts:
        footer_lines.append(" · ".join(bank_parts))
    if company.invoice_footer_text:
        footer_lines.append(company.invoice_footer_text)

    def _draw_footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.grey)
        y = 15 * mm
        for line in reversed(footer_lines):
            canvas.drawCentredString(A4[0] / 2, y, line.replace("<b>", "").replace("</b>", ""))
            y += 4 * mm
        # Seitenzahl
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f"Seite {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return output_path


def _default_intro(customer) -> str:
    """Standard-Anrede basierend auf Kundentyp."""
    if customer.customer_type == "business":
        return ("Sehr geehrte Damen und Herren,<br/><br/>"
                "vielen Dank für Ihren Auftrag. Wir berechnen Ihnen wie folgt:")
    name = customer.last_name or customer.first_name or ""
    if name:
        return (f"Sehr geehrte/r {name},<br/><br/>"
                "vielen Dank für Ihren Auftrag. Wir berechnen Ihnen wie folgt:")
    return ("Sehr geehrte/r Kunde/in,<br/><br/>"
            "vielen Dank für Ihren Auftrag. Wir berechnen Ihnen wie folgt:")
