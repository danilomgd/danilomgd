#!/usr/bin/env python3
"""Gera uma imagem a partir de texto (text-to-image) e baixa o resultado.

Uso:
    python3 scripts/gerar_imagem.py "descricao da imagem"
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hf_api import HiggsfieldClient, HiggsfieldError, Job, carregar_env  # noqa: E402

ENDPOINT = "/v1/text2image/soul"


def progresso(job: Job) -> None:
    print(f"  status: {job.status}")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    prompt = sys.argv[1]

    carregar_env()
    cliente = HiggsfieldClient()

    entrada = {
        "prompt": prompt,
        "quality": "1080p",
        "aspect_ratio": "9:16",
        "batch_size": 1,
    }

    print(f"Enviando job para {ENDPOINT}...")
    try:
        final = cliente.gerar(ENDPOINT, entrada, espera_maxima=600, ao_atualizar=progresso)
    except HiggsfieldError as erro:
        print(f"[FALHA] {erro}")
        return 1

    urls = final.urls()
    if not urls:
        print("Job concluiu, mas nenhuma URL foi encontrada no retorno:")
        print(final.raw)
        return 1

    for indice, url in enumerate(urls, start=1):
        destino = Path("out") / f"imagem_{final.request_id[:8]}_{indice}.png"
        print(f"Baixando {url} -> {destino}")
        cliente.baixar(url, destino)

    print("Concluido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
