"""
Rechnungs-Service: Nummer-Generierung, Summen-Berechnung.
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session

from app.models import Invoice, InvoiceItem, Company


def generate_invoice_number(db: Session, company: Company) -> str:
    """Erzeugt die nächste Rechnungsnummer nach dem Pattern in den Firmen-Einstellungen."""
    today = date.today()
    pattern = company.invoice_number_pattern or "{prefix}{year}-{seq:04d}"
    prefix = company.invoice_number_prefix or "RE-"

    # Bei Jahreswechsel Zähler zurücksetzen
    if company.invoice_seq_year != today.year:
        company.invoice_next_seq = 1
        company.invoice_seq_year = today.year

    seq = company.invoice_next_seq or 1
    number = pattern.format(prefix=prefix, year=today.year, month=today.month, seq=seq)

    # Sicherstellen dass die Nummer nicht schon vergeben ist
    while db.query(Invoice).filter(Invoice.invoice_number == number).first():
        seq += 1
        number = pattern.format(prefix=prefix, year=today.year, month=today.month, seq=seq)

    company.invoice_next_seq = seq + 1
    db.flush()
    return number


def recalculate_totals(invoice: Invoice) -> None:
    """Berechnet alle Summen einer Rechnung neu (Positionen + Header)."""
    subtotal_net = 0.0
    vat_total = 0.0

    for item in invoice.items:
        qty = item.quantity or 0
        unit_price = item.unit_price_net or 0
        discount = (item.discount_percent or 0) / 100
        line_net = qty * unit_price * (1 - discount)
        vat_rate = (item.vat_rate or 0) / 100
        line_vat = line_net * vat_rate

        item.line_total_net = round(line_net, 2)
        item.line_vat = round(line_vat, 2)
        item.line_total_gross = round(line_net + line_vat, 2)

        subtotal_net += line_net
        vat_total += line_vat

    invoice.subtotal_net = round(subtotal_net, 2)
    invoice.vat_total = round(vat_total, 2)
    invoice.total_gross = round(subtotal_net + vat_total + (invoice.reminder_fee or 0), 2)

    # Fälligkeit aus Zahlungsziel
    if invoice.invoice_date and invoice.payment_terms_days and not invoice.due_date:
        invoice.due_date = invoice.invoice_date + timedelta(days=invoice.payment_terms_days)


def create_invoice_from_job(db: Session, job, customer, company: Company) -> Invoice:
    """Legt eine Rechnung mit einer Position aus einem Auftrag an."""
    inv = Invoice(
        invoice_number=generate_invoice_number(db, company),
        customer_id=customer.id,
        job_id=job.id,
        status="draft",
        invoice_date=date.today(),
        service_date=job.completion_date or job.order_date,
        payment_terms_days=company.default_payment_terms_days or 14,
        skonto_percent=company.default_skonto_percent or 0,
        skonto_days=company.default_skonto_days or 7,
        payment_method="Überweisung",
    )

    # Eine Position aus dem Auftrag erzeugen
    desc = job.title
    if job.description:
        desc += f"\n{job.description}"

    item = InvoiceItem(
        position=1,
        description=desc,
        quantity=job.quantity or 1,
        unit="Stk",
        unit_price_net=(job.price_net or 0) / (job.quantity or 1) if (job.quantity or 1) else (job.price_net or 0),
        vat_rate=job.vat_rate or company.default_vat_rate or 19.0,
    )
    inv.items.append(item)

    recalculate_totals(inv)
    db.add(inv)
    db.flush()
    return inv
