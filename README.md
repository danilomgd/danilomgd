# Integração Higgsfield via chave de API

Conexão direta com a Higgsfield API usando chave e segredo próprios, sem
depender do conector MCP. Roda em qualquer lugar: servidor, container, cron,
n8n, função serverless.

Escrito só com a biblioteca padrão do Python — **não há nada para instalar**.

## Estrutura

```
hf_api/
  client.py    cliente REST (auth, retry, polling, download)
  errors.py    exceções tipadas por tipo de falha
scripts/
  testar_conexao.py   valida a chave — rode este primeiro
  gerar_imagem.py     text-to-image
  gerar_video.py      image-to-video
n8n/
  README.md    o mesmo fluxo em n8n, sem código
```

## Passo 1 — Gerar a chave

1. Acesse https://cloud.higgsfield.ai
2. Vá em **API Keys** (ou Console → Credentials)
3. Crie uma chave. Você recebe dois valores: **Key ID** e **Key Secret**
4. O segredo só aparece uma vez. Guarde num gerenciador de senhas

## Passo 2 — Configurar as credenciais

```bash
cp .env.example .env
```

Abra o `.env` e preencha:

```
HF_API_KEY=seu_key_id
HF_API_SECRET=seu_key_secret
```

O `.env` já está no `.gitignore`. Nunca faça commit dele, nunca cole a chave
num chat e nunca coloque em código-fonte.

## Passo 3 — Testar

```bash
python3 scripts/testar_conexao.py
```

Saída esperada em caso de sucesso: `[OK] ... AUTENTICACAO FUNCIONOU`.

Se aparecer `[FALHA] A chave foi rejeitada`, o Key ID ou o Secret estão
errados, ou a chave foi revogada.

## Passo 4 — Gerar

```bash
python3 scripts/gerar_imagem.py "advogado em escritório moderno, luz natural"

python3 scripts/gerar_video.py "câmera se aproxima lentamente" https://url/da/imagem.jpg
```

Os arquivos são baixados na pasta `out/`.

## Uso como biblioteca

```python
from hf_api import HiggsfieldClient, carregar_env

carregar_env()
cliente = HiggsfieldClient()

# Bloqueante: envia e espera terminar
job = cliente.gerar("/v1/text2image/soul", {
    "prompt": "produto sobre fundo branco, foto de estúdio",
    "aspect_ratio": "9:16",
})
print(job.urls())

# Não bloqueante: ideal para pipelines em escala
job = cliente.submeter("/v1/image2video/dop", {...})
guardar_no_banco(job.request_id)   # consulte o status depois
```

### Webhook em vez de polling

Para volume alto, polling desperdiça requisições. Defina `HF_WEBHOOK_URL` no
`.env` e a API chama seu endpoint quando o job termina:

```
HF_WEBHOOK_URL=https://seu-dominio.com/webhooks/higgsfield
```

O cliente anexa `?hf_webhook=<url>` automaticamente na submissão.

## Referência técnica

| Item | Valor |
|---|---|
| Base URL | `https://api.higgsfield.ai` |
| Autenticação | `Authorization: Key <KEY_ID>:<KEY_SECRET>` |
| Content-Type | `application/json` |
| Consulta de status | `GET /requests/{request_id}/status` |
| Estados do job | `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `cancelled` |
| Text-to-image | `POST /v1/text2image/soul` |
| Image-to-video | `POST /v1/image2video/dop` |

Equivalente em curl:

```bash
curl -X POST https://api.higgsfield.ai/v1/text2image/soul \
  -H "Authorization: Key $HF_API_KEY:$HF_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"params":{"prompt":"um gato astronauta","aspect_ratio":"9:16"}}'
```

## Tratamento de erros

Cada falha tem sua exceção, para o pipeline reagir de forma diferente a cada
uma em vez de tratar tudo como erro genérico:

| Exceção | HTTP | O que fazer |
|---|---|---|
| `HiggsfieldConfigError` | — | Credencial ausente. Corrigir o `.env` |
| `HiggsfieldAuthError` | 401/403 | Chave inválida ou revogada. Gerar outra |
| `HiggsfieldInsufficientCredits` | 402 | Recarregar créditos |
| `HiggsfieldRateLimited` | 429 | Já tem retry automático; reduzir concorrência |
| `HiggsfieldJobFailed` | — | Job rejeitado (inclui `nsfw`). Revisar o prompt |
| `HiggsfieldTimeout` | — | Excedeu a espera; o job pode ainda concluir |

Requisições com 429 e 5xx são repetidas automaticamente com backoff
exponencial (1s, 2s, 4s). Erros 401, 402 e 403 falham na hora, porque repetir
não resolve.

## Segurança

- A chave nunca aparece em mensagens de erro ou logs
- O `.env` está no `.gitignore`
- Variáveis do ambiente real têm prioridade sobre o `.env` — em produção, use
  o gerenciador de segredos da sua infra, não o arquivo
- Rotacione a chave se ela vazar em qualquer lugar

## Pontos a confirmar no seu painel

A documentação oficial (`docs.higgsfield.ai`) está bloqueada na rede onde este
código foi escrito, então três pontos foram baseados nos SDKs oficiais e devem
ser conferidos no seu console:

1. **Nomes dos modelos** (`dop-turbo`) e parâmetros específicos de cada um
2. **Billing**: confirme se a API de plataforma consome os créditos da sua
   assinatura ou tem cobrança separada
3. **Catálogo completo de endpoints** além de text2image e image2video
