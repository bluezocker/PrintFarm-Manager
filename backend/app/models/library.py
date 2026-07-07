"""3MF/G-Code Datei-Archiv (Bibliothek).

Zentrale Datei-Verwaltung für alle druckbaren Dateien.
User kann Dateien hochladen, taggen, direkt an Drucker senden.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class LibraryFile(Base):
    __tablename__ = "library_files"

    id = Column(Integer, primary_key=True)
    filename = Column(String(300), nullable=False)         # Original-Dateiname
    display_name = Column(String(300))                     # User-bearbeitbarer Name
    stored_path = Column(String(500), nullable=False)      # Interner Speicherpfad
    file_size = Column(Integer)                             # Bytes
    file_type = Column(String(20))                          # "3mf", "gcode", "stl"
    thumbnail_path = Column(String(500))                    # Extrahiertes Thumbnail

    # Metadaten aus 3MF (wenn vorhanden)
    estimated_time_minutes = Column(Integer)                # Druckzeit-Schätzung
    estimated_material_g = Column(Float)                    # Material-Schätzung
    layer_height = Column(Float)
    nozzle_diameter = Column(Float)

    # Organisation
    tags = Column(String(500))                              # Kommagetrennt: "spoolbuddy,useful,work"
    description = Column(Text)
    category = Column(String(50), default="general")        # general, work, hobby, ...

    # Tracking
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_by = relationship("User")
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    last_used_date = Column(DateTime(timezone=True))
    times_printed = Column(Integer, default=0)
