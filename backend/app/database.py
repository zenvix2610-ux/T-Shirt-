from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()
engine = create_engine(
    settings.sqlalchemy_url,
    connect_args={"check_same_thread": False} if settings.sqlalchemy_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401

    DATA_READY = True
    Base.metadata.create_all(bind=engine)
    return DATA_READY
