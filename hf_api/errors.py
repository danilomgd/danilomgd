"""Excecoes do cliente Higgsfield.

Todas as mensagens sao construidas sem jamais incluir a chave ou o segredo,
para que logs e stack traces possam ser compartilhados com seguranca.
"""
from __future__ import annotations


class HiggsfieldError(Exception):
    """Erro base da integracao."""


class HiggsfieldConfigError(HiggsfieldError):
    """Credenciais ausentes ou malformadas."""


class HiggsfieldHTTPError(HiggsfieldError):
    """Resposta HTTP de erro da API."""

    def __init__(self, status: int, body: str, endpoint: str) -> None:
        self.status = status
        self.body = body
        self.endpoint = endpoint
        super().__init__(f"HTTP {status} em {endpoint}: {body[:500]}")


class HiggsfieldAuthError(HiggsfieldHTTPError):
    """401/403 - chave invalida, revogada ou sem permissao."""


class HiggsfieldInsufficientCredits(HiggsfieldHTTPError):
    """402 - creditos insuficientes na conta da API."""


class HiggsfieldRateLimited(HiggsfieldHTTPError):
    """429 - limite de requisicoes atingido."""


class HiggsfieldJobFailed(HiggsfieldError):
    """O job terminou em estado nao bem-sucedido (failed, nsfw, cancelled)."""

    def __init__(self, request_id: str, status: str, payload: dict | None = None) -> None:
        self.request_id = request_id
        self.status = status
        self.payload = payload or {}
        super().__init__(f"Job {request_id} terminou com status '{status}'")


class HiggsfieldTimeout(HiggsfieldError):
    """O job nao terminou dentro do tempo maximo de espera."""

    def __init__(self, request_id: str, waited: float) -> None:
        self.request_id = request_id
        self.waited = waited
        super().__init__(
            f"Job {request_id} nao concluiu em {waited:.0f}s. "
            f"Ele pode continuar processando - consulte o status depois."
        )
