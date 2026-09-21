#!/usr/bin/env python3
"""Verifica se a chave da Higgsfield esta funcionando.

Rode este script ANTES de qualquer outro:
    python3 scripts/testar_conexao.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hf_api import (  # noqa: E402
    HiggsfieldAuthError,
    HiggsfieldClient,
    HiggsfieldConfigError,
    HiggsfieldError,
    carregar_env,
)


def mascarar(valor: str) -> str:
    """Mostra so o suficiente para conferir qual chave esta em uso."""
    if len(valor) <= 8:
        return "*" * len(valor)
    return f"{valor[:4]}{'*' * (len(valor) - 8)}{valor[-4:]}"


def main() -> int:
    carregar_env()

    try:
        cliente = HiggsfieldClient()
    except HiggsfieldConfigError as erro:
        print(f"[ERRO DE CONFIGURACAO] {erro}")
        print("\nPassos:")
        print("  1. cp .env.example .env")
        print("  2. preencha HF_API_KEY e HF_API_SECRET no .env")
        print("  3. rode este script de novo")
        return 1

    print("Credenciais carregadas:")
    print(f"  Base URL   : {cliente.base_url}")
    print(f"  HF_API_KEY : {mascarar(cliente.api_key)}")
    print(f"  HF_API_SECRET: {mascarar(cliente.api_secret)}")
    print()
    print("Testando autenticacao contra a API...")

    # Consulta um request_id inexistente de proposito.
    # 401/403 = chave invalida. 404 ou payload vazio = chave VALIDA.
    try:
        cliente.status("00000000-0000-0000-0000-000000000000")
        print("[OK] A API respondeu. A chave esta autenticando corretamente.")
        return 0
    except HiggsfieldAuthError as erro:
        print(f"[FALHA] A chave foi rejeitada (HTTP {erro.status}).")
        print("  - Confira se copiou key ID e secret completos, sem espacos.")
        print("  - Confira se a chave nao foi revogada em https://cloud.higgsfield.ai")
        return 1
    except HiggsfieldError as erro:
        texto = str(erro)
        if "404" in texto or "not found" in texto.lower():
            print("[OK] A API respondeu 404 para um job inexistente.")
            print("     Isso confirma que a AUTENTICACAO FUNCIONOU.")
            return 0
        print(f"[ATENCAO] Resposta inesperada: {texto[:300]}")
        print("  A chave pode estar certa, mas o endpoint de status difere.")
        print("  Confira a rota de status no painel em https://cloud.higgsfield.ai")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
