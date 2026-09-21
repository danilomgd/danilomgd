#!/usr/bin/env python3
"""Descobre qual formato de autenticacao a Higgsfield aceita com suas credenciais.

Nem toda conta usa o mesmo esquema. Algumas usam par chave/segredo, outras um
token unico do tipo Bearer. Em vez de adivinhar, este script testa todas as
combinacoes plausiveis e informa qual delas o servidor aceita.

Uso:
    python3 scripts/diagnosticar_auth.py

Nenhuma credencial e impressa na tela nem gravada em disco.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hf_api import carregar_env  # noqa: E402
import os  # noqa: E402

# Job inexistente: 401/403 = auth rejeitada. Qualquer outra coisa = auth aceita.
CAMINHO_TESTE = "/requests/00000000-0000-0000-0000-000000000000/status"


def mascarar(valor: str) -> str:
    if not valor:
        return "(vazio)"
    if len(valor) <= 8:
        return "*" * len(valor)
    return f"{valor[:4]}...{valor[-4:]} ({len(valor)} caracteres)"


def testar(nome: str, headers: dict[str, str], base_url: str) -> tuple[str, str]:
    """Devolve (resultado, descricao) onde resultado e 'ok', 'rejeitado' ou 'rede'."""
    url = f"{base_url.rstrip('/')}{CAMINHO_TESTE}"
    headers = {**headers, "Content-Type": "application/json", "Accept": "application/json"}
    requisicao = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(requisicao, timeout=30) as resposta:
            return "ok", f"HTTP {resposta.status} - aceito"
    except urllib.error.HTTPError as erro:
        if erro.code in (401, 403):
            return "rejeitado", f"HTTP {erro.code} - rejeitado"
        if erro.code == 404:
            return "ok", "HTTP 404 - job inexistente, mas AUTENTICOU"
        if erro.code == 402:
            return "ok", "HTTP 402 - autenticou, porem sem creditos"
        corpo = erro.read().decode("utf-8", errors="replace")[:120]
        return "ok", f"HTTP {erro.code} - autenticou? resposta: {corpo}"
    except Exception as erro:  # noqa: BLE001
        return "rede", f"erro de rede: {type(erro).__name__}: {str(erro)[:120]}"


def main() -> int:
    carregar_env()

    chave = os.environ.get("HF_API_KEY", "").strip()
    segredo = os.environ.get("HF_API_SECRET", "").strip()
    credenciais = os.environ.get("HF_CREDENTIALS", "").strip()
    base_url = os.environ.get("HF_BASE_URL", "https://api.higgsfield.ai").strip()

    if credenciais and ":" in credenciais and not (chave and segredo):
        chave, _, segredo = credenciais.partition(":")

    if not chave and not segredo:
        print("Nenhuma credencial encontrada no .env ou no ambiente.")
        return 1

    print("=" * 66)
    print("DIAGNOSTICO DE AUTENTICACAO - HIGGSFIELD")
    print("=" * 66)
    print(f"Base URL      : {base_url}")
    print(f"HF_API_KEY    : {mascarar(chave)}")
    print(f"HF_API_SECRET : {mascarar(segredo)}")
    print()

    # Alerta heuristico: um Key ID raramente parece um rotulo descritivo.
    suspeito = chave and (
        "-" in chave and chave.replace("-", "").replace("_", "").isalpha()
        or chave.lower().startswith(("claude", "minha", "teste", "nome", "my", "key-", "integra"))
    )
    if suspeito:
        print("[ALERTA] O valor de HF_API_KEY parece um NOME descritivo, nao um")
        print("         identificador. Confira se voce nao colou o rotulo da")
        print("         chave no lugar do Key ID.")
        print()

    variantes: list[tuple[str, dict[str, str]]] = [
        ("Key <id>:<secret>", {"Authorization": f"Key {chave}:{segredo}"}),
        ("Bearer <secret>", {"Authorization": f"Bearer {segredo}"}),
        ("Bearer <id>:<secret>", {"Authorization": f"Bearer {chave}:{segredo}"}),
        ("Key <secret>", {"Authorization": f"Key {segredo}"}),
        ("Bearer <id>", {"Authorization": f"Bearer {chave}"}),
        ("hf-api-key + hf-secret", {"hf-api-key": chave, "hf-secret": segredo}),
        ("X-API-Key: <secret>", {"X-API-Key": segredo}),
        ("X-API-Key: <id>", {"X-API-Key": chave}),
    ]

    print(f"Testando {len(variantes)} formatos contra {CAMINHO_TESTE}\n")

    vencedores: list[str] = []
    falhas_de_rede = 0
    for nome, headers in variantes:
        resultado, detalhe = testar(nome, headers, base_url)
        marca = {"ok": "ACEITO ", "rejeitado": "rejeit.", "rede": "S/ REDE"}[resultado]
        print(f"  [{marca}] {nome:<26} {detalhe}")
        if resultado == "ok":
            vencedores.append(nome)
        elif resultado == "rede":
            falhas_de_rede += 1

    print()
    print("=" * 66)
    if vencedores:
        print("RESULTADO: formato(s) que autenticaram:")
        for nome in vencedores:
            print(f"  -> {nome}")
        print()
        print("Me envie esta saida para eu ajustar o cliente ao formato correto.")
        return 0

    if falhas_de_rede == len(variantes):
        print("RESULTADO: nao foi possivel falar com a API - todas as tentativas")
        print("falharam por rede, nenhuma chegou a ser avaliada pelo servidor.")
        print()
        print("Isso NAO diz nada sobre suas credenciais. Verifique:")
        print("  - conexao com a internet")
        print("  - VPN, proxy ou firewall bloqueando api.higgsfield.ai")
        print(f"  - se {base_url} e o endereco correto")
        return 1

    print("RESULTADO: nenhum formato autenticou.")
    print()
    print("Isso indica que o problema esta nos VALORES, nao no formato. Verifique:")
    print("  1. HF_API_KEY contem o Key ID (nao o nome/rotulo da chave)")
    print("  2. A chave foi gerada na API de plataforma (cloud.higgsfield.ai),")
    print("     nao no painel do app de consumidor")
    print("  3. A chave nao foi revogada e a conta tem a API habilitada")
    print("  4. Nao ha espaco ou quebra de linha sobrando nos valores")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
