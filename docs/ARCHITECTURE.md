# Arquitetura — Mecânico de Fusca

Documento-guia da evolução de protótipo para produto (web + app Android na Play Store).

**Decisões fechadas:**

| Tema        | Decisão                                                        |
| ----------- | -------------------------------------------------------------- |
| Mobile      | Capacitor (shell nativo sobre o React atual)                   |
| Backend     | Supabase (Postgres + Auth + Storage + pgvector) — tudo migrado |
| Monetização | Assinatura mensal via Google Play Billing                      |

---

## 1. Consequência central: separar cliente de servidor

Hoje o app é um TanStack Start SSR monolítico. **Não existe Node rodando dentro do celular**, então o Capacitor exige:

- **Cliente**: bundle estático, empacotado no APK.
- **Servidor**: API remota em URL fixa e absoluta.

Isso força uma disciplina que o projeto já deveria ter: nenhuma lógica de negócio pode viver só no cliente, e o cliente nunca fala com o banco em operações sensíveis.

```
┌─ Web (SSR/Nitro) ─┐   ┌─ Android (Capacitor) ─┐
│  bundle SSR       │   │  bundle SPA estático  │
└─────────┬─────────┘   └───────────┬───────────┘
          └──────────┬──────────────┘
                     ▼
        API Nitro (deploy único, remoto)
        · /api/chat   · quota   · billing
                     ▼
        ┌────────────────────────────┐
        │  Supabase                  │
        │  Postgres + RLS            │
        │  pgvector (RAG)            │
        │  Auth · Storage            │
        └────────────────────────────┘
```

A API continua em Nitro/TypeScript (não em Edge Functions Deno): mantém uma linguagem só, e o AI SDK já funciona como está. O servidor fala com o Supabase via `service_role`.

---

## 2. Estrutura de pastas alvo

Organização **por domínio**, não por tipo de arquivo. Hoje `lib/` é um saco de gatos e `threads.ts` sozinho tem 556 linhas misturando quatro responsabilidades.

```
├── android/                    # gerado pelo Capacitor, commitado
├── supabase/
│   ├── migrations/             # schema + RLS versionados = fonte da verdade
│   └── seed/                   # conteúdo base do RAG
├── src/
│   ├── app/                    # router, root route, providers
│   ├── features/
│   │   ├── chat/               # components/ hooks/ api.ts model.ts
│   │   ├── garage/             # ficha do veículo
│   │   ├── auth/
│   │   └── billing/
│   ├── server/                 # NUNCA vai pro cliente
│   │   ├── ai/                 # prompt.ts · rag.ts · provider.ts
│   │   ├── billing/            # validação de recibo Play
│   │   ├── quota.ts
│   │   └── db.ts               # client service-role
│   ├── shared/                 # ui/ · utils · tipos comuns
│   └── routes/                 # fino: só compõe features
└── docs/
```

`vite.config.ts` **já** bloqueia import de `**/server/**` no cliente (`importProtection`). A pasta `src/server/` passa a valer de verdade.

**Regra de ouro por camada:**

- `model.ts` — funções puras, sem I/O. É o que tem teste.
- `api.ts` — acesso a dados, sem regra de negócio.
- `components/` — sem acesso a dados direto; consomem hooks.

---

## 3. Problemas críticos encontrados

Levantamento de 2026-07-25. O status de cada item é mantido aqui; o relato de como
foi resolvido fica em `docs/CONTEXTO.md`.

| #    | Problema                                | Status                 |
| ---- | --------------------------------------- | ---------------------- |
| 3.1  | Anexos reenviados a cada mensagem       | ✅ resolvido           |
| 3.2  | `isAdmin` escrito pelo cliente          | ✅ resolvido           |
| 3.3  | Exclusão de conta não existe            | ⛔ bloqueia lançamento |
| 3.4  | Histórico inteiro em toda requisição    | ✅ resolvido           |
| 3.5  | Zero validação de entrada               | ✅ resolvido           |
| 3.6  | Zero testes                             | ✅ resolvido           |
| 3.7  | Persistência reescreve a thread inteira | ⏳ Fase 2              |
| 3.8  | Peso do bundle                          | ✅ resolvido           |
| 3.9  | Sem observabilidade                     | ⏳ antes do lançamento |
| 3.10 | Ficha do veículo não chegava ao modelo  | ✅ resolvido           |

### 3.1 Anexos são re-enviados a cada mensagem — custo cresce sem limite ✅

`inlineRemoteAttachments()` percorria **todas** as mensagens do histórico a cada request, baixando cada anexo do Storage e convertendo para base64. Uma conversa com 5 fotos re-enviava as 5 imagens inteiras em **toda** mensagem nova.

**Resolvido** em `src/server/ai/messages.ts`: janela de anexos + cache por URL.

### 3.2 `isAdmin` é decidido e gravado pelo próprio cliente ✅

O navegador escrevia `isAdmin` no próprio documento do usuário — o cliente definindo o próprio direito de acesso. Inofensivo como selo na sidebar; com assinatura, falha de receita.

**Resolvido**: `src/features/auth/entitlements.ts` só lê, e `firestore.rules` recusa escrita do cliente nesses campos.

### 3.3 Exclusão de conta — requisito de publicação ⛔

A política do Google Play exige que apps com criação de conta ofereçam exclusão **dentro do app** e por **uma URL pública**, apagando também os dados. Não existe nada disso. Sem isso o app não passa na revisão. (Confirmar o texto vigente da política antes do envio.)

Planejado para a Fase 2: apagar conta precisa limpar banco e Storage numa operação só.

### 3.4 Histórico inteiro enviado em toda requisição ✅

**Resolvido**: janela de 24 mensagens em `src/server/ai/messages.ts`. Sumarização do que fica de fora continua em aberto — vale reavaliar quando o RAG entrar.

### 3.5 Zero validação de entrada ✅

**Resolvido**: `src/server/ai/schema.ts` valida o payload; `src/shared/config/env.ts` e `src/server/config/env.ts` validam as variáveis de ambiente na inicialização.

### 3.6 Zero testes ✅

**Resolvido**: Vitest + 62 testes sobre a lógica pura, sem mock de Firebase.

### 3.7 Persistência ineficiente das mensagens ⏳

`saveThreadMessages` reescreve o documento inteiro da thread a cada 600 ms durante o streaming. No Postgres vira: insere a mensagem do usuário na hora, insere a do assistente no `onFinish`. Uma linha por mensagem. **Fase 2.**

### 3.8 Peso do bundle ✅

**Resolvido**: 16 MB / 407 arquivos → 2,3 MB / 7 arquivos. O grosso vinha dos plugins do Streamdown (Shiki com 400+ gramáticas, KaTeX, Mermaid). Detalhes e reversão em `docs/CONTEXTO.md`.

### 3.9 Sem observabilidade ⏳

Só `console.error`. Com usuários pagantes, erro que ninguém vê é erro que não existe. Escolher e plugar antes do lançamento.

### 3.10 A ficha do veículo nunca chegava ao modelo ✅

`useChat({ body })` é ignorado no AI SDK v6 — `body` pertence a `ChatRequestOptions`, no `sendMessage`. A "Minha Garagem" salvava no Firestore e o modelo nunca via o dado. Falha silenciosa, sem erro em runtime.

**Resolvido** em `src/features/chat/components/ChatWindow.tsx`. Serve de lembrete: o cast que existia na API escondia esse tipo de erro.

---

## 4. Modelo de dados (Supabase)

Esboço inicial — detalhar nas migrations.

```sql
profiles        (id → auth.users, display_name, is_admin, created_at)
vehicles        (id, user_id, apelido, modelo, ano, motor, carburacao,
                 combustivel, ignicao, sistema_eletrico, modificacoes, is_active)
threads         (id, user_id, title, title_edited, created_at, updated_at)
messages        (id, thread_id, role, parts jsonb, created_at)
attachments     (id, message_id, storage_path, media_type, expires_at)
subscriptions   (user_id, plan, status, play_purchase_token,
                 current_period_end, updated_at)     -- só o servidor escreve
usage_events    (id, user_id, kind, tokens, created_at)  -- quota e custo

documents       (id, source, title, content, metadata jsonb)
chunks          (id, document_id, content, embedding vector(768), tokens)
```

**Regras:**

- RLS ligada em todas as tabelas desde a primeira migration. Sem exceção.
- `vehicles` já é plural — a "Minha Garagem" comporta vários carros (o mockup em `references/perfil-veiculo.html` já previa isso).
- `subscriptions` e `is_admin`: `SELECT` para o dono, `UPDATE`/`INSERT` só via `service_role`.
- Índice HNSW em `chunks.embedding`; busca híbrida (vetorial + full-text português) via função `RPC`.

---

## 5. Roteiro por fases

Cada fase deixa o app funcionando. Nada de big bang.

### Fase 1 — Fundação de qualidade ✅ _(concluída em 2026-07-25)_

- ✅ Vitest + 62 testes da lógica pura
- ✅ Zod: validação do payload da API e das env vars na inicialização
- ✅ Poda de dependências e dos componentes `ui/` órfãos
- ✅ CI: typecheck + lint + test + build
- ✅ Reorganização para a estrutura da seção 2
- ⏳ Observabilidade — adiada para antes do lançamento (§3.9)

### Fase 2 — Migração para Supabase

- Migrations com schema + RLS
- Auth anônimo + Google (no Android, `signInWithIdToken` com o plugin nativo — é o ponto de atrito conhecido)
- Reescrever `threads` / `vehicles` / `auth` sobre o Supabase, usando **TanStack Query** (já é dependência e hoje não é usada; substitui os singletons de `useSyncExternalStore` escritos à mão)
- Storage + política de retenção dos anexos
- Script de migração dos dados dos usuários atuais
- Exclusão de conta (seção 3.3)

### Fase 3 — Capacitor

- Build SPA para o app, SSR para a web
- URL da API por variável de ambiente
- `capacitor init`, plugins: push, camera, filesystem, billing
- Ícones, splash, permissões, target SDK

### Fase 4 — RAG (pgvector)

- Pipeline de ingestão: chunking + embeddings + metadados de fonte
- Busca híbrida, com filtro pelo perfil do carro do usuário
- Prompt reescrito para citar fontes e admitir quando não encontrou nada
- Correção de 3.1 e 3.4 no mesmo passo (é o mesmo arquivo)

### Fase 5 — Monetização

- Play Billing + validação de recibo no servidor
- Entitlements server-authoritative (3.2)
- Quota e rate limiting por usuário
- Free tier com limite

---

## 6. Princípios

1. **O servidor é a autoridade.** Cliente pede, servidor decide. Vale dobrado para entitlement e quota.
2. **Schema no repositório.** Nada de mudar estrutura pelo painel do Supabase — o painel não tem histórico nem review.
3. **Lógica pura é testável; I/O é isolado.** Se algo é difícil de testar, está na camada errada.
4. **Uma fase, um app funcionando.**
5. **Custo de token é custo de produto.** Toda mudança no caminho do chat passa pela pergunta: quanto isso custa por mensagem?
