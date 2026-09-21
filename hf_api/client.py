"""Cliente REST minimalista para a Higgsfield API.

Usa apenas a biblioteca padrao do Python (sem dependencias externas), para
rodar em qualquer ambiente: notebook, servidor, container, funcao serverless.

Autenticacao confirmada na documentacao oficial:
    Authorization: Key <KEY_ID>:<KEY_SECRET>
    Content-Type: application/json
    Base URL: https://api.higgsfield.ai

Fluxo da API e assincrono:
    1. POST no endpoint do modelo  -> devolve um request_id
    2. GET /requests/{id}/status   -> polling ate status terminal
    3. status 'completed'          -> payload traz as URLs dos arquivos
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .errors import (
    HiggsfieldAuthError,
    HiggsfieldConfigError,
    HiggsfieldHTTPError,
    HiggsfieldInsufficientCredits,
    HiggsfieldJobFailed,
    HiggsfieldRateLimited,
    HiggsfieldTimeout,
)

DEFAULT_BASE_URL = "https://api.higgsfield.ai"

STATUS_SUCCESS = {"completed"}
STATUS_FAILURE = {"failed", "nsfw", "cancelled", "canceled"}
STATUS_PENDING = {"queued", "in_progress", "in_queue", "processing", "pending"}


def carregar_env(caminho: str | Path = ".env") -> None:
    """Le um arquivo .env simples para os.environ.

    Nao sobrescreve variaveis ja definidas no ambiente - o ambiente real
    (servidor, CI, container) sempre tem prioridade sobre o arquivo local.
    """
    arquivo = Path(caminho)
    if not arquivo.is_file():
        return
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        chave = chave.strip()
        valor = valor.strip().strip('"').strip("'")
        if chave and chave not in os.environ:
            os.environ[chave] = valor


@dataclass
class Job:
    """Resultado de uma submissao a API."""

    request_id: str
    status: str
    raw: dict[str, Any]

    @property
    def concluido(self) -> bool:
        return self.status.lower() in STATUS_SUCCESS

    def urls(self) -> list[str]:
        """Extrai todas as URLs de midia do payload, qualquer que seja o formato.

        A estrutura da resposta varia por modelo, entao a busca e recursiva em
        vez de assumir um caminho fixo como results[0].url.
        """
        encontradas: list[str] = []

        def _varrer(no: Any) -> None:
            if isinstance(no, dict):
                for chave, valor in no.items():
                    if (
                        isinstance(valor, str)
                        and valor.startswith("http")
                        and chave in {"url", "video_url", "image_url", "audio_url", "output_url", "min_url", "raw_url"}
                    ):
                        encontradas.append(valor)
                    else:
                        _varrer(valor)
            elif isinstance(no, list):
                for item in no:
                    _varrer(item)

        _varrer(self.raw)
        # remove duplicatas preservando a ordem
        return list(dict.fromkeys(encontradas))


class HiggsfieldClient:
    """Cliente sincrono da Higgsfield API."""

    def __init__(
        self,
        api_key: str | None = None,
        api_secret: str | None = None,
        base_url: str | None = None,
        timeout: int = 120,
        max_tentativas: int = 4,
    ) -> None:
        credenciais = os.environ.get("HF_CREDENTIALS")
        if credenciais and not (api_key and api_secret):
            if ":" not in credenciais:
                raise HiggsfieldConfigError(
                    "HF_CREDENTIALS deve estar no formato 'key_id:key_secret'."
                )
            api_key, _, api_secret = credenciais.partition(":")

        self.api_key = api_key or os.environ.get("HF_API_KEY", "")
        self.api_secret = api_secret or os.environ.get("HF_API_SECRET", "")

        if not self.api_key or not self.api_secret:
            raise HiggsfieldConfigError(
                "Credenciais ausentes. Defina HF_API_KEY e HF_API_SECRET no ambiente "
                "ou em um arquivo .env (veja .env.example). "
                "Gere as chaves em https://cloud.higgsfield.ai"
            )

        self.base_url = (base_url or os.environ.get("HF_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.max_tentativas = max_tentativas

    # ------------------------------------------------------------------
    # Camada HTTP
    # ------------------------------------------------------------------
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Key {self.api_key}:{self.api_secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "hf-api-cliente/1.0",
        }

    def _requisicao(
        self,
        metodo: str,
        caminho: str,
        corpo: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = caminho if caminho.startswith("http") else f"{self.base_url}/{caminho.lstrip('/')}"
        dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None

        ultimo_erro: Exception | None = None
        for tentativa in range(self.max_tentativas):
            requisicao = urllib.request.Request(
                url, data=dados, headers=self._headers(), method=metodo
            )
            try:
                with urllib.request.urlopen(requisicao, timeout=self.timeout) as resposta:
                    texto = resposta.read().decode("utf-8")
                    return json.loads(texto) if texto.strip() else {}
            except urllib.error.HTTPError as erro:
                texto = erro.read().decode("utf-8", errors="replace")
                # Erros definitivos: nao adianta repetir
                if erro.code in (401, 403):
                    raise HiggsfieldAuthError(erro.code, texto, caminho) from None
                if erro.code == 402:
                    raise HiggsfieldInsufficientCredits(erro.code, texto, caminho) from None
                if erro.code == 429:
                    ultimo_erro = HiggsfieldRateLimited(erro.code, texto, caminho)
                elif 500 <= erro.code < 600:
                    ultimo_erro = HiggsfieldHTTPError(erro.code, texto, caminho)
                else:
                    raise HiggsfieldHTTPError(erro.code, texto, caminho) from None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as erro:
                ultimo_erro = erro

            if tentativa < self.max_tentativas - 1:
                time.sleep(2 ** tentativa)  # 1s, 2s, 4s

        raise HiggsfieldHTTPError(0, f"Falha apos {self.max_tentativas} tentativas: {ultimo_erro}", caminho)

    # ------------------------------------------------------------------
    # Operacoes
    # ------------------------------------------------------------------
    def submeter(
        self,
        endpoint: str,
        entrada: dict[str, Any],
        webhook_url: str | None = None,
    ) -> Job:
        """Envia um job e devolve imediatamente, sem esperar a conclusao."""
        caminho = endpoint
        webhook = webhook_url or os.environ.get("HF_WEBHOOK_URL")
        if webhook:
            separador = "&" if "?" in caminho else "?"
            caminho = f"{caminho}{separador}hf_webhook={urllib.parse.quote(webhook, safe='')}"

        resposta = self._requisicao("POST", caminho, {"params": entrada})
        request_id = (
            resposta.get("request_id")
            or resposta.get("id")
            or resposta.get("job_id")
            or ""
        )
        if not request_id:
            raise HiggsfieldHTTPError(
                200, f"Resposta sem request_id: {json.dumps(resposta)[:500]}", endpoint
            )
        return Job(request_id=request_id, status=resposta.get("status", "queued"), raw=resposta)

    def status(self, request_id: str) -> Job:
        """Consulta o estado atual de um job."""
        resposta = self._requisicao("GET", f"/requests/{request_id}/status")
        return Job(
            request_id=request_id,
            status=str(resposta.get("status", "unknown")),
            raw=resposta,
        )

    def aguardar(
        self,
        request_id: str,
        intervalo: float = 5.0,
        espera_maxima: float = 900.0,
        ao_atualizar: Callable[[Job], None] | None = None,
    ) -> Job:
        """Faz polling ate o job atingir um estado terminal."""
        inicio = time.monotonic()
        while True:
            job = self.status(request_id)
            if ao_atualizar:
                ao_atualizar(job)

            estado = job.status.lower()
            if estado in STATUS_SUCCESS:
                return job
            if estado in STATUS_FAILURE:
                raise HiggsfieldJobFailed(request_id, job.status, job.raw)

            decorrido = time.monotonic() - inicio
            if decorrido > espera_maxima:
                raise HiggsfieldTimeout(request_id, decorrido)
            time.sleep(intervalo)

    def gerar(
        self,
        endpoint: str,
        entrada: dict[str, Any],
        espera_maxima: float = 900.0,
        ao_atualizar: Callable[[Job], None] | None = None,
    ) -> Job:
        """Submete e espera o resultado. Atalho para submeter() + aguardar()."""
        job = self.submeter(endpoint, entrada)
        return self.aguardar(job.request_id, espera_maxima=espera_maxima, ao_atualizar=ao_atualizar)

    # ------------------------------------------------------------------
    # Utilitario
    # ------------------------------------------------------------------
    @staticmethod
    def baixar(url: str, destino: str | Path) -> Path:
        """Baixa um arquivo gerado para o disco local."""
        caminho = Path(destino)
        caminho.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=300) as resposta, caminho.open("wb") as arquivo:
            while bloco := resposta.read(1 << 16):
                arquivo.write(bloco)
        return caminho
