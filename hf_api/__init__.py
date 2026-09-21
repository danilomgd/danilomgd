"""Integracao direta com a Higgsfield API via chave/segredo."""
from .client import HiggsfieldClient, Job, carregar_env
from .errors import (
    HiggsfieldAuthError,
    HiggsfieldConfigError,
    HiggsfieldError,
    HiggsfieldHTTPError,
    HiggsfieldInsufficientCredits,
    HiggsfieldJobFailed,
    HiggsfieldRateLimited,
    HiggsfieldTimeout,
)

__all__ = [
    "HiggsfieldClient",
    "Job",
    "carregar_env",
    "HiggsfieldError",
    "HiggsfieldConfigError",
    "HiggsfieldHTTPError",
    "HiggsfieldAuthError",
    "HiggsfieldInsufficientCredits",
    "HiggsfieldRateLimited",
    "HiggsfieldJobFailed",
    "HiggsfieldTimeout",
]
__version__ = "1.0.0"
