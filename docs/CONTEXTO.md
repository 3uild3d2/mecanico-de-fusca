# Contexto e Memória do Projeto

Diário de decisões e estado real do trabalho. Complementa `docs/ARCHITECTURE.md` (o alvo) e `AGENTS.md` (as regras). **As regras de manutenção deste arquivo estão em `AGENTS.md` — leia antes de editar.**

Entrada nova vai no topo de cada seção, com data absoluta.

---

## Onde o trabalho está

**Fase atual:** Fase 1 (fundação de qualidade) — concluída em 2026-07-25.
**Próxima:** Fase 2 (migração para Supabase). Ver `docs/ARCHITECTURE.md` §5.

O app roda em Firebase (Auth anônimo + Google, Firestore, Storage) com API em TanStack Start/Nitro e Google AI Studio (`gemini-3-flash-preview`). Nada de Supabase, Capacitor ou billing ainda existe no código.

---

## Pendências conhecidas

Coisas encontradas e deliberadamente não resolvidas ainda. Não são esquecimento.

- **Exclusão de conta não existe.** Requisito de publicação na Play Store (in-app + URL pública). Bloqueia o lançamento. Planejado para a Fase 2, junto com a migração — apagar conta precisa limpar Postgres e Storage numa transação só. `firestore.rules` já proíbe o cliente de deletar o próprio documento justamente porque isso tem que passar pelo servidor.

- **`isAdmin` de ninguém está ligado.** A correção de 2026-07-25 tirou do cliente o poder de escrever o próprio entitlement. Como ainda não existe servidor escrevendo esse campo, o selo de admin não aparece para ninguém. Para reativar agora, defina `isAdmin: true` manualmente no documento `users/{uid}` pelo console do Firebase. A solução definitiva é custom claim ou coluna com RLS, na Fase 5.

- **Persistência da thread reescreve tudo.** `saveThreadMessages` grava o documento inteiro (todas as mensagens) a cada 600 ms durante o streaming. Ineficiente e caro em escritas. Some na Fase 2, quando `messages` virar tabela com uma linha por mensagem.

- **Store manual em vez de TanStack Query.** `features/*/api.ts` usa `useSyncExternalStore` escrito à mão. `@tanstack/react-query` já é dependência e está sem uso. A troca acontece na Fase 2, junto com a mudança de backend — fazer antes seria reescrever duas vezes.

- **Logo pesado.** `src/assets/fusca-logo.png` tem 346 KB para ser exibido a 96 px, e o build gera um chunk de ~638 KB por causa dele. Vale gerar versões redimensionadas em WebP. Não foi feito por falta de ferramenta de imagem no ambiente.

- **Sem observabilidade.** Só `console.error`. Com usuário pagante, erro que ninguém vê não existe. Escolher e plugar (Sentry ou equivalente) antes do lançamento.

- **Sem rate limiting.** Qualquer um com a URL da API pode consumir a chave do Google AI Studio. Urgente a partir do momento em que o app for público. Fase 5, ou antes se publicar.

- **`zod` na v3.** O AI SDK v6 tende a v4. Não deu conflito porque usamos zod isolado, mas vale alinhar quando mexer nas dependências.

---

## Decisões

### 2026-07-25 — Remover os plugins pesados do Streamdown

`@streamdown/code` (Shiki), `@streamdown/math` (KaTeX) e `@streamdown/mermaid` somavam ~13 MB de assets: gramáticas de mais de 400 linguagens, renderizador de LaTeX e de diagramas. O cliente saiu de **16 MB / 407 arquivos** para **2,3 MB / 7 arquivos**; o build caiu de 7,7 s para 2,6 s.

O gatilho foi o Capacitor: na web esses chunks são lazy-loaded e quase não incomodam, mas dentro de um APK todo esse peso viaja no aparelho do usuário. Um chatbot que responde sobre carburador em português não renderiza C++ nem diagrama Mermaid.

**Efeito colateral aceito:** blocos de código continuam renderizando, mas sem realce de sintaxe. `@streamdown/cjk` foi mantido — é irrelevante para pt-BR mas custa quase nada.

**Reversível:** reinstale o pacote e adicione de volta em `streamdownPlugins`, em `features/chat/components/message.tsx`. Reintroduza só o plugin que for realmente necessário.

### 2026-07-25 — A ficha do veículo nunca chegava ao modelo

`useChat({ body })` não existe no AI SDK v6 — `body` pertence a `ChatRequestOptions`, o segundo argumento de `sendMessage`. O código passava o veículo nas opções do hook, onde era silenciosamente ignorado.

Ou seja: o usuário preenchia "Minha Garagem", o dado salvava no Firestore, e o modelo nunca via nada. A funcionalidade estava morta desde que foi escrita, sem erro visível. O TypeScript só acusou depois que o arquivo passou a ser checado — o cast anterior escondia.

Corrigido passando `requestOptions` em cada `sendMessage`. Bug irmão: `ano_motor` era coletado no formulário mas ficava de fora do texto montado para o prompt — hoje `formatVehicleSpecs` cobre todos os campos, com teste.

### 2026-07-25 — Anexos: cache e janela em vez de reenvio

A implementação anterior rebaixava do Storage e reconvertia para base64 **todos** os anexos do histórico a **cada** requisição. Uma conversa com 5 fotos reenviava as 5 imagens inteiras em toda mensagem nova — custo de token, latência e banda crescendo de forma composta.

Agora, em `server/ai/messages.ts`: janela de 24 mensagens de histórico, anexos embutidos só nas 4 últimas, e cache em memória por URL (TTL 30 min, teto de 64 MB). Anexos fora da janela viram uma nota em texto, então o modelo sabe que houve anexo sem pagar por ele.

**Alternativa descartada:** Files API do Google (upload uma vez, referência depois). É a solução mais correta e elimina o base64 de vez, mas exige gerenciar ciclo de vida de arquivo no lado do Google. O cache resolve o caso agudo com muito menos superfície. Vale reconsiderar na Fase 4, quando o RAG mexer nesse mesmo arquivo.

### 2026-07-25 — Entitlement sai do cliente

`threads.ts` comparava o e-mail do usuário com uma constante e gravava `isAdmin` no próprio documento. O cliente escrevia o próprio direito de acesso — inofensivo enquanto era só um selo na sidebar, mas com assinatura mensal viraria falha de receita.

Agora `features/auth/entitlements.ts` apenas **lê** de `users/{uid}`, e `firestore.rules` recusa qualquer escrita do cliente em `isAdmin`, `plan`, `subscription`, `subscriptionStatus` e `planExpiresAt`. Escrever esses campos é responsabilidade exclusiva do servidor.

Foi criado também `firestore.rules`, que **não existia** — as regras viviam só no console, sem versionamento nem revisão.

### 2026-07-25 — Estrutura por domínio

`src/lib/` era um saco de gatos e `threads.ts` sozinho tinha 556 linhas misturando acesso ao Firestore, derivação de título, migração de localStorage, debounce e binding com React.

Reorganizado em `features/` (domínio), `server/` (só servidor) e `shared/` (transversal). A separação `model.ts` (puro) / `api.ts` (I/O) é o que tornou possível ter 62 testes sem um único mock de Firebase.

`src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/styles.css` e `src/routes/` ficaram na raiz de propósito: são pontos de entrada resolvidos por caminho no build. Mover quebraria.

### 2026-07-25 — Decisões de produto (do dono do projeto)

- **Capacitor** para a Play Store, e não TWA nem React Native. Preserva 100% do React atual e abre acesso a push, câmera nativa e Play Billing.
- **Supabase para tudo**, não só para o banco vetorial. Uma identidade só, RLS coerente, e o pgvector no mesmo Postgres dos dados do usuário — dá para fazer RAG cruzando com o perfil do carro.
- **Assinatura mensal** via Play Billing, com free tier limitado.

---

## Histórico resolvido

- **2026-07-25** — Zero testes → 62 testes cobrindo título de conversa, ficha do veículo e preparo de mensagens. Vitest configurado em `vitest.config.ts`, separado do `vite.config.ts` de propósito (os testes não devem carregar os plugins de SSR/Nitro).
- **2026-07-25** — Zero validação → zod no payload de `/api/chat` e nas variáveis de ambiente, com erro legível na inicialização em vez de quebrar quando o usuário abre o chat.
- **2026-07-25** — 45 dependências → 35. Removidos 17 pacotes Radix, `recharts`, `embla-carousel-react`, `react-day-picker`, `input-otp`, `vaul`, `react-resizable-panels`, `react-hook-form`, `@hookform/resolvers`, `react-markdown`, `date-fns` e 3 plugins do Streamdown. Junto, 34 componentes `ui/` órfãos do scaffold do shadcn.
- **2026-07-25** — Sem CI → `.github/workflows/ci.yml` com typecheck, lint, test e build.
