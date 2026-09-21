#!/usr/bin/env python3
"""Gera um video a partir de uma imagem (image-to-video) e baixa o resultado.

Uso:
    python3 scripts/gerar_video.py "prompt cinematografico" https://url/da/imagem.jpg

O endpoint /v1/image2video/dop e o caminho confirmado na documentacao oficial.
Os nomes dos modelos e parametros extras podem variar - confira o catalogo em
https://cloud.higgsfield.ai antes de mudar valores.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hf_api import HiggsfieldClient, HiggsfieldError, Job, carregar_env  # noqa: E402

ENDPOINT = "/v1/image2video/dop"


def progresso(job: Job) -> None:
    print(f"  status: {job.status}")


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1

    prompt = sys.argv[1]
    url_imagem = sys.argv[2]

    carregar_env()
    cliente = HiggsfieldClient()

    entrada = {
        "model": "dop-turbo",
        "prompt": prompt,
        "input_images": [{"type": "image_url", "image_url": url_imagem}],
    }

    print(f"Enviando job para {ENDPOINT}...")
    try:
        job = cliente.submeter(ENDPOINT, entrada)
        print(f"Job aceito. request_id = {job.request_id}")
        print("Aguardando conclusao (isso costuma levar alguns minutos)...")
        final = cliente.aguardar(job.request_id, intervalo=5, espera_maxima=1200, ao_atualizar=progresso)
    except HiggsfieldError as erro:
        print(f"[FALHA] {erro}")
        return 1

    urls = final.urls()
    if not urls:
        print("Job concluiu, mas nenhuma URL foi encontrada no retorno:")
        print(final.raw)
        return 1

    for indice, url in enumerate(urls, start=1):
        destino = Path("out") / f"video_{final.request_id[:8]}_{indice}.mp4"
        print(f"Baixando {url} -> {destino}")
        cliente.baixar(url, destino)

    print("Concluido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
