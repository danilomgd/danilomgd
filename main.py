#!/usr/bin/env python3
"""Gera um video com Seedance 2.5 usando o SDK oficial da Higgsfield.

Modelo : bytedance/seedance-2.5/text-to-video
Prompt : "A cinematic scene at sunset"
Duracao: 5s | Resolucao: 720p | Proporcao: 16:9

Uso:
    python3 main.py

Requer HF_KEY em .env.local no formato  key-id:key-secret

ATENCAO: cada execucao dispara uma geracao real e CONSOME CREDITOS.

Nota sobre o SDK: subscribe() faz polling ate um estado terminal e devolve o
JSON sem levantar excecao. Estados terminais incluem Failed, NSFW e Cancelled,
entao um retorno sem erro NAO significa sucesso. Por isso o status final e
verificado explicitamente antes de reportar qualquer resultado.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# .env.local tem prioridade; variaveis ja no ambiente nunca sao sobrescritas.
RAIZ = Path(__file__).resolve().parent
load_dotenv(RAIZ / ".env.local", override=False)
load_dotenv(RAIZ / ".env", override=False)

from higgsfield_client import (  # noqa: E402
    Cancelled,
    Completed,
    CredentialsMissedError,
    Failed,
    HiggsfieldClientError,
    NSFW,
    Status,
    SyncClient,
)

MODELO = "bytedance/seedance-2.5/text-to-video"

ARGUMENTOS: dict[str, Any] = {
    "prompt": "A cinematic scene at sunset",
    "duration": 5,
    "resolution": "720p",
    "aspect_ratio": "16:9",
}

# Chaves cujo valor, sendo uma URL, representa a midia gerada.
CHAVES_DE_MIDIA = {
    "url",
    "video_url",
    "output_url",
    "raw_url",
    "min_url",
    "download_url",
}


def extrair_urls(payload: Any) -> list[str]:
    """Varre o JSON de resposta em busca das URLs do video gerado.

    A estrutura de retorno varia por modelo, entao a busca e recursiva em vez
    de assumir um caminho fixo como results[0].url.
    """
    encontradas: list[str] = []

    def _varrer(no: Any) -> None:
        if isinstance(no, dict):
            for chave, valor in no.items():
                if isinstance(valor, str) and valor.startswith("http") and chave in CHAVES_DE_MIDIA:
                    encontradas.append(valor)
                else:
                    _varrer(valor)
        elif isinstance(no, list):
            for item in no:
                _varrer(item)

    _varrer(payload)
    return list(dict.fromkeys(encontradas))


def main() -> int:
    print("=" * 62)
    print("HIGGSFIELD - SEEDANCE 2.5 - TEXT TO VIDEO")
    print("=" * 62)
    print(f"Modelo    : {MODELO}")
    print(f"Prompt    : {ARGUMENTOS['prompt']}")
    print(f"Duracao   : {ARGUMENTOS['duration']}s")
    print(f"Resolucao : {ARGUMENTOS['resolution']}")
    print(f"Proporcao : {ARGUMENTOS['aspect_ratio']}")
    print()
    print("Esta execucao consome creditos da sua conta.")
    print()

    cliente = SyncClient()

    # Guarda o ultimo status observado no polling, para decidir o desfecho.
    estado: dict[str, Any] = {"ultimo": None, "anterior": None}

    def ao_enfileirar(request_id: str) -> None:
        print(f"Job enfileirado. request_id = {request_id}")
        print("Aguardando conclusao...")

    def ao_atualizar(status: Status) -> None:
        estado["ultimo"] = status
        nome = type(status).__name__
        if nome != estado["anterior"]:
            print(f"  status: {nome}")
            estado["anterior"] = nome

    try:
        resultado = cliente.subscribe(
            MODELO,
            arguments=ARGUMENTOS,
            on_enqueue=ao_enfileirar,
            on_queue_update=ao_atualizar,
        )
    except CredentialsMissedError:
        print("[ERRO] Credenciais ausentes.")
        print()
        print("  1. cp .env.local.example .env.local")
        print("  2. preencha HF_KEY=key-id:key-secret no seu editor local")
        print("  3. rode novamente")
        return 2
    except HiggsfieldClientError as erro:
        print(f"[ERRO] O SDK rejeitou a requisicao: {erro}")
        return 3
    except Exception as erro:  # noqa: BLE001
        print(f"[ERRO] Falha ao chamar a API: {type(erro).__name__}: {erro}")
        return 3

    ultimo = estado["ultimo"]

    # O SDK devolve normalmente mesmo em falha: o status manda, nao o retorno.
    if isinstance(ultimo, Failed):
        print("\n[FALHA] A geracao falhou. Nenhum video foi produzido.")
        print(f"Resposta da API: {resultado}")
        return 1
    if isinstance(ultimo, NSFW):
        print("\n[MODERADO] O conteudo foi sinalizado pelo filtro de seguranca.")
        print("Nenhum video foi produzido. Ajuste o prompt e tente de novo.")
        return 1
    if isinstance(ultimo, Cancelled):
        print("\n[CANCELADO] A requisicao foi cancelada antes de processar.")
        return 1
    if ultimo is not None and not isinstance(ultimo, Completed):
        print(f"\n[INDEFINIDO] Status final inesperado: {type(ultimo).__name__}")
        print(f"Resposta da API: {resultado}")
        return 1

    # Checagem redundante, direto no corpo da resposta.
    status_no_corpo = str(resultado.get("status", "")).lower() if isinstance(resultado, dict) else ""
    if status_no_corpo and status_no_corpo not in ("completed", "success", "succeeded"):
        print(f"\n[FALHA] A resposta reporta status '{status_no_corpo}'.")
        print(f"Resposta da API: {resultado}")
        return 1

    urls = extrair_urls(resultado)
    if not urls:
        print("\n[ATENCAO] O job concluiu, mas nenhuma URL de video foi encontrada.")
        print("Nao e possivel confirmar sucesso. Resposta completa:")
        print(resultado)
        return 1

    print("\n[SUCESSO] Video gerado.")
    for url in urls:
        print(f"  {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
