# O mesmo fluxo em n8n (sem código)

Se você prefere orquestrar visualmente em vez de rodar scripts Python, este é
o equivalente no n8n. É o caminho recomendado para o pipeline de conteúdo
automatizado, porque agenda, repete e integra com as redes sociais sem
servidor próprio.

## 1. Guardar a credencial

n8n → **Credentials** → **New** → **Header Auth**

| Campo | Valor |
|---|---|
| Name | `Higgsfield API` |
| Header Name | `Authorization` |
| Header Value | `Key SEU_KEY_ID:SEU_KEY_SECRET` |

A credencial fica criptografada no n8n. Nunca coloque a chave direto no nó
HTTP, senão ela aparece no JSON exportado do workflow.

## 2. Desenho do fluxo

```
[Schedule Trigger]        dispara no horário definido
        ↓
[Gerar roteiro]           chamada à API do Claude com o prompt do formato
        ↓
[HTTP Request]            POST no endpoint Higgsfield → devolve request_id
        ↓
[Wait]                    30 a 60 segundos
        ↓
[HTTP Request]            GET /requests/{{request_id}}/status
        ↓
[IF status = completed]   não → volta para o Wait (loop de polling)
        ↓ sim
[HTTP Request]            baixa o arquivo da URL retornada
        ↓
[Postar]                  TikTok / Instagram / YouTube
        ↓
[Google Sheets]           registra data, prompt, custo, link e métricas
```

## 3. Configuração do nó de submissão

- **Method**: `POST`
- **URL**: `https://api.higgsfield.ai/v1/image2video/dop`
- **Authentication**: Generic → Header Auth → `Higgsfield API`
- **Send Body**: ativado, JSON:

```json
{
  "model": "dop-turbo",
  "prompt": "{{ $json.prompt }}",
  "input_images": [
    { "type": "image_url", "image_url": "{{ $json.imagem }}" }
  ]
}
```

## 4. Nó de polling

- **Method**: `GET`
- **URL**: `https://api.higgsfield.ai/requests/{{ $json.request_id }}/status`
- Mesma credencial

No nó **IF**, compare `{{ $json.status }}` com `completed`. O ramo falso
retorna ao **Wait**, formando o loop. Coloque um limite de iterações para o
fluxo não girar para sempre se um job travar.

## 5. Alternativa com webhook (recomendado em escala)

O loop de polling consome execuções do n8n. Acima de ~50 vídeos/dia, troque
por webhook:

1. Crie um nó **Webhook** no n8n e copie a URL de produção
2. Acrescente à URL de submissão: `?hf_webhook=https://sua-instancia-n8n/webhook/higgsfield`
3. O fluxo de submissão termina no POST — sem espera
4. Um segundo fluxo começa no Webhook e faz download + publicação

Fica mais barato, mais rápido e sem execuções travadas.

## 6. Planilha de controle

Registre toda geração numa aba do Google Sheets com estas colunas:

| Data | Prompt | Endpoint | request_id | Custo | Link | Views 24h | Views 7d |
|---|---|---|---|---|---|---|---|

Sem esse registro você não consegue responder qual formato performa nem qual
é o custo real por vídeo publicado — e é isso que decide se a operação escala
ou queima caixa.
