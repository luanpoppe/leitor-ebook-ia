# Dicionário pessoal

> Atualizado em 2026-10-30 — fontes: `packages/backend/src/dictionary/**`, `packages/backend/src/chat/chat-dictionary-tools.ts`, `packages/frontend/src/features/dictionary/**`

## O que é

Uma lista de palavras que o leitor teve dificuldade, salva pelo chat durante a leitura. Cada palavra guarda o significado, um exemplo e, quando houver, o livro, o capítulo e o trecho onde apareceu. A página `/dicionario` lista tudo, filtra por livro e busca por palavra/significado/livro.

## Como funciona

- **Dados** — tabela `dictionary_entries`: `word`, `normalized_word` (único), `meaning`, `example`, `quote`, `book_id` opcional, `chapter_position` opcional, timestamps. O livro usa `ON DELETE SET NULL`: excluir o livro não apaga a palavra.
- **Regra de unicidade** — uma entrada por palavra normalizada (minúscula, sem pontuação nas bordas, espaços colapsados). Se a palavra já existe, o significado/exemplo/contexto são atualizados em vez de duplicar.
- **Chat** — `ChatDictionaryTools` expõe `adicionar_ao_dicionario(palavra, significado, exemplo?, trecho?, capitulo?)`. O livro é o da conversa; o capítulo é validado se informado. O prompt só usa a ferramenta quando o leitor pede explicitamente para adicionar/salvar uma palavra.
- **API** — `GET /dictionary` (todas as palavras, com o livro), filtros opcionais `q` e `bookId`.
- **UI** — `/dicionario` na sidebar: cards com a palavra, resumo do significado e livro/capítulo; busca e filtro por livro; o detalhe mostra significado, exemplo, trecho do livro e link para o capítulo.

## Decisões e porquês

- **Uma palavra por entrada** — é um dicionário, não um histórico de ocorrências; reencontrar a palavra atualiza o registro. Múltiplos contextos por palavra ficaram para depois.
- **Contexto opcional** — a palavra pode ter sido salva sem livro/capítulo; a definição continua útil.
- **Definição com conhecimento geral** — diferente das respostas sobre o livro, o significado pode vir do conhecimento do modelo; o trecho citado precisa ser do livro.
- **Sem criação manual nesta entrega** — a entrada nasce pelo chat; a página é de consulta/filtro.
- **Conta única do app** — não há autenticação; o dicionário é da biblioteca local (o "usuário" do app).

## Notas

- Testado: ferramenta do chat criando a palavra com livro/capítulo/trecho, página listando, filtro por livro e modal com significado/exemplo/trecho.
- Limite de listagem: 500 palavras; sem paginação nesta entrega.
- Sem testes automatizados (config `tests: off`).
