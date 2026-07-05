"""Email-Templates für Status-Benachrichtigungen."""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True)
    status_key = Column(String(50), unique=True, nullable=False)
    label = Column(String(120))
    subject = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    enabled = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
