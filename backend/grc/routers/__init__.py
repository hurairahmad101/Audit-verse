from .auth_router import router as auth_router
from .tenants_router import router as tenants_router
from .risk_register import router as risk_register_router

__all__ = [
    "auth_router",
    "tenants_router",
    "risk_register_router",
]
