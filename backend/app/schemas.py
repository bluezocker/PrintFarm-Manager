"""Pydantic Schemas für API Request/Response."""
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict


# ============ Auth ============
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBase(BaseModel):
    username: str
    email: str
    full_name: Optional[str] = None
    role: str = "employee"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserRead(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class ChangePasswordRequest(BaseModel):
    """Schema für 'eigenes Passwort ändern' (mit Verifikation)."""
    current_password: str
    new_password: str


# ============ Company ============
class CompanyBase(BaseModel):
    name: str
    owner: Optional[str] = None
    managing_director: Optional[str] = None
    business_type: Optional[str] = None
    street: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = "Deutschland"
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    tax_number: Optional[str] = None
    vat_id: Optional[str] = None
    trade_register: Optional[str] = None
    iban: Optional[str] = None
    bic: Optional[str] = None
    bank_name: Optional[str] = None
    # Rechnungseinstellungen
    invoice_number_prefix: Optional[str] = "RE-"
    invoice_number_pattern: Optional[str] = "{prefix}{year}-{seq:04d}"
    invoice_next_seq: Optional[int] = 1
    default_payment_terms_days: Optional[int] = 14
    default_skonto_percent: Optional[float] = 0.0
    default_skonto_days: Optional[int] = 7
    default_vat_rate: Optional[float] = 19.0
    invoice_footer_text: Optional[str] = None
    notes: Optional[str] = None


class CompanyUpdate(CompanyBase):
    name: Optional[str] = None


class CompanyRead(CompanyBase):
    id: int
    logo_path: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ============ Printer ============
class PrinterBase(BaseModel):
    name: str
    model: Optional[str] = None
    brand: Optional[str] = "Bambu Lab"
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None
    bambu_device_id: Optional[str] = None
    bambu_access_code: Optional[str] = None
    bambu_ip: Optional[str] = None
    bambu_serial: Optional[str] = None
    octo_url: Optional[str] = None
    octo_api_key: Optional[str] = None
    connection_mode: str = "lan"
    tuya_device_id: Optional[str] = None
    # Kalkulation
    hourly_rate: float = 0.0
    power_price_kwh: float = 0.30
    avg_power_w: float = 120.0
    margin_percent: float = 20.0


class PrinterCreate(PrinterBase):
    pass


class PrinterUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    brand: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None
    bambu_device_id: Optional[str] = None
    bambu_access_code: Optional[str] = None
    bambu_ip: Optional[str] = None
    bambu_serial: Optional[str] = None
    octo_url: Optional[str] = None
    octo_api_key: Optional[str] = None
    connection_mode: Optional[str] = None
    tuya_device_id: Optional[str] = None
    hourly_rate: Optional[float] = None
    power_price_kwh: Optional[float] = None
    avg_power_w: Optional[float] = None
    margin_percent: Optional[float] = None


class PrinterRead(PrinterBase):
    id: int
    status: str
    current_job_name: Optional[str] = None
    progress: float
    nozzle_temp: Optional[float] = None
    bed_temp: Optional[float] = None
    remaining_time: Optional[int] = None
    last_seen: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ============ Maintenance ============
class MaintenanceBase(BaseModel):
    date: date
    maintenance_type: Optional[str] = None
    description: str
    technician: Optional[str] = None
    cost: float = 0.0
    next_due_date: Optional[date] = None


class MaintenanceCreate(MaintenanceBase):
    pass


class MaintenanceRead(MaintenanceBase):
    id: int
    printer_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ============ Filament ============
class StorageLocationBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_dry_box: int = 0


class StorageLocationCreate(StorageLocationBase):
    pass


class StorageLocationRead(StorageLocationBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class FilamentBase(BaseModel):
    manufacturer: Optional[str] = None
    material: str
    color: Optional[str] = None
    color_hex: Optional[str] = None
    diameter: float = 1.75
    spool_weight: float = 1000.0
    remaining_weight: float = 1000.0
    storage_id: Optional[int] = None
    storage_slot: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    batch_number: Optional[str] = None
    nozzle_temp: Optional[int] = None
    bed_temp: Optional[int] = None
    rfid_uid: Optional[str] = None
    notes: Optional[str] = None


class FilamentCreate(FilamentBase):
    pass


class FilamentUpdate(BaseModel):
    manufacturer: Optional[str] = None
    material: Optional[str] = None
    color: Optional[str] = None
    color_hex: Optional[str] = None
    diameter: Optional[float] = None
    spool_weight: Optional[float] = None
    remaining_weight: Optional[float] = None
    storage_id: Optional[int] = None
    storage_slot: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    batch_number: Optional[str] = None
    nozzle_temp: Optional[int] = None
    bed_temp: Optional[int] = None
    rfid_uid: Optional[str] = None
    notes: Optional[str] = None


class FilamentRead(FilamentBase):
    id: int
    storage: Optional[StorageLocationRead] = None
    model_config = ConfigDict(from_attributes=True)


# ============ Customer ============
class CustomerBase(BaseModel):
    customer_type: str = "private"
    customer_number: Optional[str] = None
    company_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    street: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    country: str = "Deutschland"
    email: Optional[str] = None
    phone: Optional[str] = None
    vat_id: Optional[str] = None
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    customer_type: Optional[str] = None
    customer_number: Optional[str] = None
    company_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    street: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    vat_id: Optional[str] = None
    notes: Optional[str] = None


class CustomerRead(CustomerBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ============ Print Job ============
class PrintJobBase(BaseModel):
    customer_id: int
    title: str
    description: Optional[str] = None
    status: str = "new"
    order_date: Optional[date] = None
    due_date: Optional[date] = None
    completion_date: Optional[date] = None
    quantity: int = 1
    estimated_hours: Optional[float] = None
    estimated_material_g: Optional[float] = None
    price_net: float = 0.0
    price_gross: float = 0.0
    vat_rate: float = 19.0
    print_file_name: Optional[str] = None  # Dateiname für Auto-Matching mit MQTT
    notes: Optional[str] = None


class JobFilamentInput(BaseModel):
    """Reserviertes Filament für eine Druckplatte (oder Auftrag wenn keine Platten)."""
    filament_id: int
    grams_reserved: float
    slot: Optional[int] = None


class JobFilamentRead(BaseModel):
    id: int
    filament_id: Optional[int] = None
    plate_id: Optional[int] = None
    grams_reserved: float
    grams_used: Optional[float] = None
    slot: Optional[int] = None
    filament: Optional[FilamentRead] = None
    model_config = ConfigDict(from_attributes=True)


class JobPlateInput(BaseModel):
    """Eine Druckplatte innerhalb eines Auftrags."""
    position: int = 1
    name: Optional[str] = None
    duration_hours: float = 0.0
    filaments: List[JobFilamentInput] = []


class JobPlateRead(BaseModel):
    id: int
    position: int
    name: Optional[str] = None
    duration_hours: float
    filaments: List[JobFilamentRead] = []
    model_config = ConfigDict(from_attributes=True)


class PrintJobCreate(PrintJobBase):
    filaments: Optional[List[JobFilamentInput]] = None  # Legacy ohne Platten
    plates: Optional[List[JobPlateInput]] = None        # Neu: Aufteilung in Platten


class PrintJobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None
    completion_date: Optional[date] = None
    quantity: Optional[int] = None
    estimated_hours: Optional[float] = None
    estimated_material_g: Optional[float] = None
    price_net: Optional[float] = None
    price_gross: Optional[float] = None
    vat_rate: Optional[float] = None
    print_file_name: Optional[str] = None
    notes: Optional[str] = None
    filaments: Optional[List[JobFilamentInput]] = None
    plates: Optional[List[JobPlateInput]] = None


class PrintJobRead(PrintJobBase):
    id: int
    order_number: Optional[str] = None
    file_path: Optional[str] = None
    result_photo_path: Optional[str] = None
    customer_notified_start: bool = False
    customer_notified_done: bool = False
    calculated_cost_net: Optional[float] = None
    calculated_price_net: Optional[float] = None
    cost_breakdown: Optional[str] = None
    created_at: datetime
    customer: Optional[CustomerRead] = None
    reserved_filaments: List[JobFilamentRead] = []
    plates: List[JobPlateRead] = []
    model_config = ConfigDict(from_attributes=True)


# ============ Calculation ============
class FilamentInputItem(BaseModel):
    """Ein Filament + dessen Verbrauch für die Kalkulation."""
    filament_id: int
    grams: float


class CalculationRequest(BaseModel):
    """Anfrage für eine Druckkalkulation."""
    printer_id: int
    duration_hours: float
    # Entweder material_g (Gesamt, alt) ODER filaments (Liste, neu)
    material_g: Optional[float] = None
    filament_id: Optional[int] = None  # Single-Filament Kompatibilität
    filaments: Optional[List[FilamentInputItem]] = None  # Multi-Color
    actual_kwh: Optional[float] = None
    quantity: int = 1


# ============ Print History ============
class FilamentUsageInput(BaseModel):
    """Ein einzelnes verwendetes Filament in einem Druck."""
    filament_id: Optional[int] = None  # None erlaubt: Filament wurde gelöscht oder unbekannt
    grams_used: float
    slot: Optional[int] = None


class FilamentUsageRead(BaseModel):
    id: int
    filament_id: Optional[int] = None
    grams_used: float
    slot: Optional[int] = None
    filament: Optional[FilamentRead] = None
    model_config = ConfigDict(from_attributes=True)


class PrintHistoryBase(BaseModel):
    printer_id: int
    job_id: Optional[int] = None
    filament_id: Optional[int] = None  # Legacy: Haupt-Filament für einfarbige Drucke
    job_name: str
    file_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    material_used_g: Optional[float] = None
    power_used_kwh: Optional[float] = None
    status: Optional[str] = None
    layer_count: Optional[int] = None
    notes: Optional[str] = None


class PrintHistoryCreate(PrintHistoryBase):
    # Liste verwendeter Filamente - wenn leer, wird filament_id + material_used_g (Legacy) genutzt
    filaments: Optional[List[FilamentUsageInput]] = None


class PrintHistoryRead(PrintHistoryBase):
    id: int
    created_at: datetime
    filament_usage: List[FilamentUsageRead] = []
    model_config = ConfigDict(from_attributes=True)


# ============ Power ============
class PowerReadingRead(BaseModel):
    id: int
    printer_id: int
    timestamp: datetime
    power_w: Optional[float] = None
    voltage_v: Optional[float] = None
    current_ma: Optional[float] = None
    energy_kwh: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)


class PowerSummary(BaseModel):
    """Aggregat: aktueller und Tages-/Monatsverbrauch."""
    current_power_w: Optional[float] = None
    today_kwh: Optional[float] = None
    month_kwh: Optional[float] = None
    total_kwh: Optional[float] = None
    last_update: Optional[datetime] = None


# ============ Invoice ============
class InvoiceItemBase(BaseModel):
    position: int = 1
    description: str
    quantity: float = 1.0
    unit: str = "Stk"
    unit_price_net: float = 0.0
    vat_rate: float = 19.0
    discount_percent: float = 0.0


class InvoiceItemCreate(InvoiceItemBase):
    pass


class InvoiceItemRead(InvoiceItemBase):
    id: int
    line_total_net: float
    line_vat: float
    line_total_gross: float
    model_config = ConfigDict(from_attributes=True)


class InvoiceBase(BaseModel):
    customer_id: int
    job_id: Optional[int] = None
    status: str = "draft"
    invoice_date: date
    service_date: Optional[date] = None
    due_date: Optional[date] = None
    paid_date: Optional[date] = None
    payment_terms_days: int = 14
    skonto_percent: float = 0.0
    skonto_days: int = 7
    payment_method: Optional[str] = None
    reminder_fee: float = 0.0
    intro_text: Optional[str] = None
    closing_text: Optional[str] = None
    notes: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    items: List[InvoiceItemCreate] = []


class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    invoice_date: Optional[date] = None
    service_date: Optional[date] = None
    due_date: Optional[date] = None
    paid_date: Optional[date] = None
    payment_terms_days: Optional[int] = None
    skonto_percent: Optional[float] = None
    skonto_days: Optional[int] = None
    payment_method: Optional[str] = None
    reminder_fee: Optional[float] = None
    intro_text: Optional[str] = None
    closing_text: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[InvoiceItemCreate]] = None


class InvoiceRead(InvoiceBase):
    id: int
    invoice_number: str
    subtotal_net: float
    vat_total: float
    total_gross: float
    reminder_count: int
    last_reminder_date: Optional[date] = None
    pdf_path: Optional[str] = None
    created_at: datetime
    items: List[InvoiceItemRead] = []
    customer: Optional[CustomerRead] = None
    model_config = ConfigDict(from_attributes=True)


# ============ SMTP / Notifications ============
class SmtpSettingsBase(BaseModel):
    enabled: bool = False
    host: Optional[str] = None
    port: int = 587
    use_tls: bool = True
    use_ssl: bool = False
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None


class SmtpSettingsRead(SmtpSettingsBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class NotificationPrefBase(BaseModel):
    on_print_success: bool = True
    on_print_failed: bool = True
    on_print_cancelled: bool = False
    on_print_started: bool = False
    on_progress_50: bool = False
    on_filament_change: bool = False
    on_pause: bool = False
    on_error: bool = True
    on_maintenance_due: bool = False
    printer_filter: Optional[str] = None


class NotificationPrefRead(NotificationPrefBase):
    id: int
    user_id: int
    model_config = ConfigDict(from_attributes=True)


# ============ Inventory ============
class InventoryItemBase(BaseModel):
    name: str
    category: str = "spare_part"
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    part_number: Optional[str] = None
    quantity: float = 0.0
    unit: str = "Stk"
    minimum_stock: float = 0.0
    purchase_price: float = 0.0
    supplier: Optional[str] = None
    purchase_date: Optional[date] = None
    location: Optional[str] = None
    printer_compat: Optional[str] = None
    notes: Optional[str] = None


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    part_number: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    minimum_stock: Optional[float] = None
    purchase_price: Optional[float] = None
    supplier: Optional[str] = None
    purchase_date: Optional[date] = None
    location: Optional[str] = None
    printer_compat: Optional[str] = None
    notes: Optional[str] = None


class InventoryItemRead(InventoryItemBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ============ Integration Settings (Tuya, Bambu Cloud) ============
class IntegrationSettingsRead(BaseModel):
    """Wird ans Frontend zurückgegeben.
    WICHTIG: Passwörter werden NICHT enthüllt - nur ein Flag ob gesetzt.
    """
    tuya_enabled: bool = False
    tuya_access_id: Optional[str] = None
    tuya_access_secret_set: bool = False
    tuya_api_endpoint: Optional[str] = None
    bambu_enabled: bool = False
    bambu_cloud_email: Optional[str] = None
    bambu_cloud_password_set: bool = False

    @classmethod
    def from_orm_safe(cls, obj):
        return cls(
            tuya_enabled=bool(obj.tuya_enabled),
            tuya_access_id=obj.tuya_access_id,
            tuya_access_secret_set=bool(obj.tuya_access_secret),
            tuya_api_endpoint=obj.tuya_api_endpoint,
            bambu_enabled=bool(obj.bambu_enabled),
            bambu_cloud_email=obj.bambu_cloud_email,
            bambu_cloud_password_set=bool(obj.bambu_cloud_password),
        )

    model_config = ConfigDict(from_attributes=True)


class IntegrationSettingsUpdate(BaseModel):
    """Schema für PATCH-Update."""
    tuya_enabled: Optional[bool] = None
    tuya_access_id: Optional[str] = None
    tuya_access_secret: Optional[str] = None     # leer = nicht ändern
    tuya_api_endpoint: Optional[str] = None
    bambu_enabled: Optional[bool] = None
    bambu_cloud_email: Optional[str] = None
    bambu_cloud_password: Optional[str] = None   # leer = nicht ändern
