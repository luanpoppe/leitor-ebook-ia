# Spec: Frontend de ebooks

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

A estante vira a tela inicial: o leitor arrasta o arquivo, vê o progresso do envio e acompanha sozinho o processamento de cada ebook. Cada livro abre em painel (e em página própria, pelo link), e quem falhou pode ser reprocessado sem reenviar o arquivo.

## Histórias do usuário

### HU-1: Eu envio meu ebook sem sair da estante

**Como** leitor, **quero** arrastar o arquivo para a estante e ver o envio progredir, **para** saber que ele entrou sem ficar esperando a tela travar.

- **CT-01** — **Dado que** estou na estante, **Quando** arrasto `dom-casmurro.epub` (2 MB) para a área de soltar, **Então** vejo o progresso do envio.
- **E** ao terminar, o livro aparece na estante como "Aguardando".
- **CT-02** — **Dado que** arrastei `dom-casmurro.docx`, **Quando** solto o arquivo, **Então** vejo "Formato não suportado. Envie EPUB, PDF, TXT ou MD.".
- **E** nenhum byte é enviado para a API.
- **CT-03** — **Dado que** arrastei um PDF de 62 MB, **Quando** solto na área, **Então** vejo o aviso do limite de 50 MB antes de qualquer envio.
- **CT-04** — **Dado que** envio o mesmo `dom-casmurro.epub` que já está na estante, **Quando** a API responde a duplicata, **Então** vejo o aviso de que ele já está na estante.
- **E** o livro existente fica destacado na lista, com a tela rolada até ele.

### HU-2: Eu vejo minha estante se atualizar sozinha

**Como** leitor, **quero** acompanhar o status de cada ebook sem recarregar a página, **para** saber quando já posso começar a ler.

- **CT-05** — **Dado que** tenho 3 ebooks enviados, **Quando** abro a tela inicial, **Então** vejo os 3 com capa, título, autor e status.
- **E** o mais recente aparece primeiro.
- **CT-06** — **Dado que** `dom-casmurro.epub` está "Processando", **Quando** a ingestão termina, **Então** o cartão passa para "Pronto" sozinho, sem recarregar.
- **CT-07** — **Dado que** um ebook falhou, **Quando** olho a estante, **Então** vejo "Falhou" com a mensagem do erro no cartão.
- **CT-08** — **Dado que** ainda não enviei nenhum ebook, **Quando** abro a estante, **Então** vejo a instrução para arrastar o primeiro arquivo.

### HU-3: Eu abro o detalhe do ebook

**Como** leitor, **quero** ver capa, autor, formato e mensagem de erro em detalhe, **para** entender o estado do livro antes de abrir ou tentar de novo.

- **CT-09** — **Dado que** clico em `dom-casmurro.epub` já pronto, **Quando** o painel abre sobre a estante, **Então** vejo capa, título, autor, formato, tamanho e data do envio.
- **CT-10** — **Dado que** estou com o painel aberto, **Quando** copio o link do livro e abro em outra aba, **Então** vejo a mesma informação numa página própria.
- **CT-11** — **Dado que** o ebook não tem capa, **Quando** abro o detalhe, **Então** vejo o título no lugar da imagem, sem espaço quebrado.

### HU-4: Eu tento de novo um ebook que falhou

**Como** leitor, **quero** pedir o reprocessamento no próprio cartão, **para** recuperar um livro sem procurar o arquivo de novo.

- **CT-12** — **Dado que** `dom-casmurro.pdf` está "Falhou", **Quando** clico em "Tentar de novo", **Então** o cartão volta para "Aguardando".
- **CT-13** — **Dado que** o ebook mudou de estado antes do meu clique, **Quando** a API recusa o reprocessamento, **Então** vejo a explicação do motivo.
- **E** a lista se atualiza com o estado real do livro.

## Edge cases

- API fora ao abrir a estante → banner com a falha e botão "Tentar novamente", sem lista vazia enganosa.
- API fora durante a atualização automática → os livros já carregados continuam na tela com um aviso discreto; volta a atualizar quando a API responder.
- Envio sem conexão ou com a API fora → aviso de falha no envio e o arquivo pode ser escolhido de novo.
- Mais de 20 livros → "Carregar mais" acrescenta a próxima página sem perder os já carregados.
- Página pedida além do fim → lista do que existe, sem erro.
- Link direto para `/ebooks/<id>` inexistente → página "não encontrado" com link de volta para a estante.
- Duas abas abertas → cada uma se atualiza sozinha; a ação de uma não quebra a outra.

## Notas técnicas

### NT-1: Envio

`POST /ebooks` com `multipart/form-data` (campo `file`) pela instância `api` do axios. O progresso vem de `onUploadProgress`. Extensão e tamanho são validados no navegador antes do envio, para o aviso ser imediato; a API continua sendo a autoridade.

```json
{
  "request": "POST /ebooks  (file=dom-casmurro.epub, 2.1 MB)",
  "progress": { "loaded": 1310720, "total": 2202009, "percent": 60 },
  "status": 202,
  "body": { "id": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e", "status": "pending", "title": "dom-casmurro" }
}
```

Erro: corpo `{ statusCode, message }`; `409` traz também `id` do livro existente para o destaque na lista.

### NT-2: Estante e atualização

`GET /ebooks?page=1&pageSize=20` devolve `{ items, page, pageSize, total }`. A tela busca a próxima página no "Carregar mais" e mantém os itens anteriores. Enquanto houver item com status `pending` ou `processing`, a lista é refeita a cada 3 segundos; quando todos estão `ready` ou `failed`, a atualização automática para.

```json
{
  "items": [
    {
      "id": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e",
      "title": "Dom Casmurro",
      "author": "Machado de Assis",
      "format": "epub",
      "status": "ready",
      "createdAt": "2026-10-20T14:03:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

### NT-3: Detalhe

`GET /ebooks/:id` devolve o resumo mais `size`, `errorMessage` e `coverUrl`. O mesmo componente de detalhe é usado no painel sobre a estante e na página `/ebooks/[id]`; a página é acessível por link direto e tem caminho de volta para a estante. `coverUrl` pode ser `null` — nesse caso entra o bloco com o título no lugar da imagem.

```json
{
  "id": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e",
  "title": "Dom Casmurro",
  "author": "Machado de Assis",
  "format": "epub",
  "status": "ready",
  "createdAt": "2026-10-20T14:03:00.000Z",
  "size": 2202009,
  "errorMessage": null,
  "coverUrl": "https://minio.local/ebooks/covers/9f2c.png?X-Amz-Expires=3600"
}
```

Erro: id inexistente → `404`; a página mostra "não encontrado".

### NT-4: Reprocessamento

`POST /ebooks/:id/reprocess` responde `202` com `{ id, status: "pending" }`; o cartão volta para "Aguardando" e a atualização automática recomeça. `409` acontece quando o livro não está mais `failed`.

```json
{
  "request": "POST /ebooks/0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e/reprocess",
  "status": 202,
  "body": { "id": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e", "status": "pending" }
}
```

### NT-5: Erros e avisos

Mensagens de erro vêm de `{ statusCode, message }` e são mostradas em toast (`react-hot-toast`) para falhas de ação; falha de carregamento vira banner na estante, com botão de tentar novamente.

```json
{ "statusCode": 422, "message": "Formato não suportado. Envie EPUB, PDF, TXT ou MD." }
```

## Contratos expostos

- `POST /ebooks` — `packages/backend/src/api/ebooks/ebooks.controller.ts:EbooksController.upload`
- `GET /ebooks` — `packages/backend/src/api/ebooks/ebooks.controller.ts:EbooksController.list`
- `GET /ebooks/:id` — `packages/backend/src/api/ebooks/ebooks.controller.ts:EbooksController.findById`
- `POST /ebooks/:id/reprocess` — `packages/backend/src/api/ebooks/ebooks.controller.ts:EbooksController.reprocess`
- `api` (axios) — `packages/frontend/src/utils/http.ts:api`
