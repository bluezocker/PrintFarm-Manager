"""Login und Mitarbeiter-Verwaltung."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    get_current_user, require_admin,
)
from app.models.user import User
from app.schemas import Token, UserCreate, UserRead, UserUpdate, ChangePasswordRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falscher Benutzername oder Passwort",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Konto deaktiviert")

    user.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({"sub": user.username, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/me/change-password")
def change_own_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eigenes Passwort ändern (für alle User verfügbar).

    Erfordert das aktuelle Passwort zur Verifikation.
    """
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Aktuelles Passwort ist falsch")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Neues Passwort muss mindestens 6 Zeichen lang sein")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"success": True, "message": "Passwort erfolgreich geändert"}


# ============ User-Verwaltung (Admin) ============

@router.get("/users", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).all()


@router.post("/users", response_model=UserRead, status_code=201)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Username bereits vergeben")
    user = User(
        username=data.username,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        hashed_password=get_password_hash(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Nicht gefunden")
    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        user.hashed_password = get_password_hash(update_data.pop("password"))
    else:
        update_data.pop("password", None)
    for k, v in update_data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    if user_id == current.id:
        raise HTTPException(400, "Eigenes Konto kann nicht gelöscht werden")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Nicht gefunden")
    db.delete(user)
    db.commit()
