---
# Leitor de ebooks

> **id**: `leitor-ebooks` · **criada**: 2026-10-22 · **idioma**: pt-BR

## Contexto

A estante já envia, prepara e lista os livros, mas não há como ler: os capítulos extraídos e os embeddings existem no banco e nenhum endpoint os expõe. Esta mudança entrega o leitor sobre o texto canônico — o mesmo que alimenta os chunks — para que EPUB, PDF, TXT e MD sejam lidos com a mesma experiência. Formatação rica e IA ficam para depois.

## Decisões macro

- **Texto canônico, não EPUB convertido**: o leitor consome `chapters.text` (parágrafos separados por `\n\n`). **Por quê**: é o mesmo texto que virou chunk e embedding, então a futura citação da IA aponta para o que está na tela; converter para EPUB exigiria Calibre/Pandoc e um segundo renderizador. **Alternativa descartada**: converter tudo para EPUB ou renderizar o arquivo original.
- **Texto puro nesta versão**: sem itálico, negrito ou imagens. **Por quê**: entrega o leitor agora sem tocar nos quatro extratores. **Alternativa descartada**: blocos HTML desde o início (fica para a fase de fidelidade).
- **Progresso no banco**: uma linha por livro, sem login. **Por quê**: o progresso acompanha o livro, não o navegador. **Alternativa descartada**: `localStorage`.
- **Título de capítulo persistido na extração**: **Por quê**: o sumário não depende de adivinhar o heading dentro do texto, e cada formato tem uma fonte confiável (nav/NCX do EPUB, outline do PDF, heading do MD). **Alternativa descartada**: derivar o título do primeiro parágrafo.
- **Sem autenticação**: modelo de usuário único, como no resto do projeto. **Por quê**: não há login hoje; a tabela de progresso nasce pronta para ganhar um dono quando houver.

## Features (executadas sequencialmente)

1. **titulos-de-capitulo** — persiste o título do capítulo na extração e reingere os livros existentes por script.
2. **api-de-capitulos** — expõe sumário e conteúdo de capítulo para o leitor.
3. **progresso-de-leitura** — grava e devolve onde o leitor parou em cada livro.
4. **tela-de-leitura** — rota de leitura com sumário, tipografia, teclado e retomada.

## Escopo

**Dentro**:
- Leitura dos quatro formatos a partir do texto canônico.
- Sumário com títulos reais e navegação anterior/próximo.
- Progresso persistido por livro.
- Controles de tipografia e navegação por teclado.

**Fora**:
- Formatação rica, imagens e layout fiel ao original.
- Grifos, anotações e marcadores.
- IA, chat e busca semântica.
- Login, multiusuário e sincronização entre dispositivos.
- Offline/PWA.
- Renderizar o PDF/EPUB original.
---
