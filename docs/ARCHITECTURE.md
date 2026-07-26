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
├── content/                    # acervo do RAG: markdown + front matter
├── supabase/
│   ├── migrations/             # schema + RLS versionados = fonte da verdade
│   └── seed/
├── src/
│   ├── features/
│   │   ├── auth/               # api.ts · entitlements.ts
│   │   ├── chat/               # api.ts · model.ts · attachments.ts · components/
│   │   ├── garage/             # api.ts · model.ts · events.ts · events-api.ts
│   │   └── billing/            # (Fase 5)
│   ├── server/                 # NUNCA vai pro cliente
│   │   ├── ai/                 # provider · prompt · messages · schema · sistema · tools · rag
│   │   ├── billing/            # validação de recibo Play (Fase 5)
│   │   ├── quota.ts            # (Fase 5)
│   │   └── config/env.ts
│   ├── shared/                 # config/ · lib/ · hooks/ · ui/
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
profiles        (id → auth.users, display_name, is_admin, plan, created_at)
vehicles        (id, user_id, apelido, modelo, ano, motor, carburacao,
                 combustivel, ignicao, sistema_eletrico, modificacoes, is_active)
vehicle_events  (id, vehicle_id, user_id, tipo, titulo, sistema, desfecho,
                 data_evento, km, thread_id, origem, created_at)
threads         (id, user_id, title, title_edited, created_at, updated_at)
messages        (id, thread_id, role, parts jsonb, created_at)
attachments     (id, message_id, storage_path, media_type, expires_at)
subscriptions   (user_id, plan, status, play_purchase_token,
                 current_period_end, updated_at)     -- só o servidor escreve
usage_events    (id, user_id, kind, tokens, created_at)  -- quota e custo

documents       (id, fonte, titulo, conteudo, aplicabilidade jsonb,
                 confianca, revisado_por, atualizado_em)
chunks          (id, document_id, conteudo, embedding vector(768),
                 aplicabilidade jsonb, busca tsvector, tokens)
```

**Regras:**

- RLS ligada em todas as tabelas desde a primeira migration. Sem exceção.
- `vehicles` já é plural — a "Minha Garagem" comporta vários carros (o mockup em `references/perfil-veiculo.html` já previa isso).
- `vehicle_events` é a memória diagnóstica descrita em `docs/CONTEXTO.md`. Hoje vive no Firestore (`users/{uid}/vehicleEvents`); a lógica pura em `features/garage/events.ts` é portável e só a camada de I/O é reescrita.
- `subscriptions`, `is_admin` e `plan`: `SELECT` para o dono, escrita só pelo servidor.
- Índice HNSW em `chunks.embedding` (768 dimensões, `gemini-embedding-001`). A dimensão é irreversível sem reprocessar o acervo.
- `chunks.busca` é `tsvector` com dicionário português: busca híbrida via função `RPC`. Vetorial sozinha erra em código de peça e valor numérico — "Solex 30 PICT", "folga 0,15mm" — onde o full-text acerta.
- `aplicabilidade` filtra por motor, ano e combustível **antes** de ranquear, cruzando com a ficha do veículo. É o que impede devolver especificação de 1600 a álcool para um 1300 a gasolina.
- `confianca` e `revisado_por` permitem manter fora de produção o conteúdo que ainda não passou por revisão humana. Num app onde torque errado quebra motor, isso não é opcional.

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

### Fase 1.5 — Raciocínio do agente ✅ _(concluída em 2026-07-25)_

- ✅ Método de diagnóstico com triagem e laço orientador (`server/ai/prompt.ts`)
- ✅ Falseamento como regra operacional
- ✅ Memória diagnóstica do carro (`features/garage/events.ts`)
- ✅ _Tool calling_ com `registrarEvento` como ferramenta de cliente
- ✅ Painel de raciocínio (`features/chat/hipoteses.ts` + `HypothesisPanel.tsx`), com o estado derivado das mensagens em vez de armazenamento próprio
- ⏳ Eval do raciocínio e UI do histórico — ver pendências em `docs/CONTEXTO.md`

### Fase 2 — Migração para Supabase

- Migrations com schema + RLS, incluindo `vehicle_events`
- Auth anônimo + Google (no Android, `signInWithIdToken` com o plugin nativo — é o ponto de atrito conhecido)
- Reescrever `threads` / `vehicles` / `events` / `auth` sobre o Supabase, usando **TanStack Query** (já é dependência e hoje não é usada; substitui os singletons de `useSyncExternalStore` escritos à mão)
- Storage + política de retenção dos anexos
- Exclusão de conta (seção 3.3)
- Sem script de migração de dados: o app nunca esteve no ar com usuários reais

### Fase 3 — RAG (pgvector)

**Movida para antes do Capacitor.** O motivo: hoje o produto é o Gemini com um prompt — replicável em uma tarde e insuficiente para sustentar assinatura. O acervo é o fosso. E iterar recuperação na web é ciclo de segundos; dentro de um APK, de minutos. Descobrir que a estratégia de busca está ruim deve acontecer antes do empacotamento, não depois.

- Pipeline de ingestão a partir de `content/`: chunking por estrutura, embeddings, metadados de aplicabilidade
- Busca híbrida (vetorial + full-text português) filtrada pela ficha do veículo
- Prompt estendido para citar fonte e admitir quando não encontrou nada
- Validação na web antes de empacotar

### Fase 4 — Capacitor

- Build SPA para o app, SSR para a web
- URL da API por variável de ambiente
- `capacitor init`, plugins: push, camera, filesystem, billing
- Ícones, splash, permissões, target SDK

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
