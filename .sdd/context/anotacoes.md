# Anotações do leitor

> Atualizado em 2026-10-28 — fontes: `packages/backend/src/notes/**`, `packages/backend/src/chat/chat-notes-tools.ts`, `packages/frontend/src/features/reader/notes/**`

## O que é

Anotações em markdown por livro, várias por ebook. O leitor cria, lê, edita e exclui manualmente pelo painel do leitor; a IA faz o mesmo pelo chat (criar resumo de capítulo, registrar explicações, listar/consultar o que já foi anotado, editar e excluir com confirmação).

## Como funciona

- **Dados** — tabela `notes` (Prisma): `id`, `book_id`, `title` (120), `content` (texto markdown), `chapter_position` opcional, `created_at`/`updated_at`. Cascata ao excluir o livro. O capítulo é uma posição (não FK), validada na gravação; o texto da nota não depende do capítulo continuar existindo.
- **API** — `NotesModule` (`src/notes`): `GET/POST /ebooks/:bookId/notes`, `GET/PATCH/DELETE /ebooks/:bookId/notes/:noteId`. `NotesService` valida livro e capítulo, e `EbooksExceptionFilter` traduz `NoteNotFoundError` (404) e `InvalidNoteChapterError` (422).
- **Chat** — `ChatNotesTools` cria cinco ferramentas para o livro da conversa: `listar_anotacoes` (títulos, capítulo, data e trecho), `ler_anotacao` (conteúdo completo), `criar_anotacao`, `atualizar_anotacao` e `excluir_anotacao`. O `ChatService` combina essas ferramentas com `buscar_no_livro`; o prompt manda usar markdown, informar o capítulo quando houver, não usar citações `[n]` dentro da nota e **só excluir depois de confirmação explícita**.
- **UI** — `ReaderNotesDrawer` (painel no leitor, aberto pelo botão "Anotações" da barra) e o botão "Anotações" no cabeçalho do chat, que fecha o chat e abre o mesmo painel. A lista tem busca local; o detalhe renderiza markdown (`NoteMarkdown`, mesma stack do chat: `react-markdown` + GFM + breaks) e o editor tem título, capítulo opcional e textarea com prévia.
- **Atalho no chat** — quando a IA cria ou edita uma nota, a resposta guarda `note_actions` em `chat_messages` e a bolha mostra "Abrir anotação: título". O botão abre o painel já no detalhe da nota e continua disponível no histórico da conversa.
- **Página global** — `/anotacoes` lista todas as notas da biblioteca (endpoint `GET /notes`, com o livro de cada uma), filtra por livro, busca por título/conteúdo/livro e abre o detalhe em markdown com link para o capítulo de origem.
- **Vínculo com o capítulo** — a nota pode guardar `chapter_position`; o detalhe mostra "Ir para o capítulo N", que fecha o painel e usa a navegação normal do leitor. O editor pré-preenche o capítulo atual ao criar uma nota nova.
- **Consistência** — o painel carrega as notas ao montar. Como o chat e o painel não ficam abertos ao mesmo tempo, mudanças feitas pela IA aparecem na próxima abertura; não há sincronização ao vivo entre os dois.

## Decisões e porquês

- **Escopo sempre pelo livro** — todos os repositórios e ferramentas recebem o `bookId` da rota/conversa; a IA não recebe ids de outros livros.
- **Exclusão com confirmação** — a IA lista a nota e pergunta; só chama `excluir_anotacao` quando a mensagem atual confirma. Protege contra interpretação errada de "apaga isso".
- **Listar devolve trecho; ler devolve tudo** — evita mandar notas longas inteiras ao modelo só para descobrir qual é a certa.
- **Markdown livre, sem HTML** — `react-markdown` não renderiza HTML bruto; títulos, listas, tabelas e código funcionam.
- **Capítulo opcional e validado** — nem toda nota pertence a um capítulo; quando pertence, a posição precisa existir no livro.
- **Sem versionamento/histórico** — o `updated_at` mostra a última alteração; guardar versões ficou fora desta entrega.

## Notas

- Limites: título 120 caracteres, conteúdo 20 mil; a API lista até 200 notas por livro.
- Testado manualmente: CRUD pela API e pela UI, markdown renderizado, edição, exclusão com confirmação, abertura pelo chat e as ferramentas de criar/listar/ler/editar/excluir (inclusive o fluxo de confirmação da exclusão).
- Sem testes automatizados (config `tests: off`).
