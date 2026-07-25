# Mecânico de Fusca

Chatbot especialista em mecânica de Volkswagen Fusca e motores VW boxer refrigerados a ar. A aplicação oferece uma interface de conversa com histórico no Firebase, sugestões iniciais e respostas em streaming via Google AI Studio.

## Funcionalidades

- Chat em português do Brasil com persona de mecânico especialista em Fusca.
- Diagnóstico orientado por sintomas, manutenção, regulagens e reparos passo a passo.
- Entrada multimodal por texto, imagem/foto e áudio gravado no navegador.
- Conversas separadas por thread com criação, navegação e exclusão pela sidebar.
- Persistência do histórico no Firebase Firestore por usuário.
- Login com Google, preservando o histórico anônimo quando a conta é vinculada pela primeira vez.
- Interface responsiva com sidebar no desktop e menu móvel.
- Respostas em streaming pela rota server-side `/api/chat`.
- Metadados SEO para a página inicial e páginas de conversa.

## Stack

- React 19
- TypeScript
- TanStack Start
- TanStack Router
- TanStack Query
- Vite
- Tailwind CSS 4
- shadcn/ui e Radix UI
- AI SDK
- Google AI Studio
- ESLint e Prettier

## Requisitos

- Node.js compatível com as dependências do projeto.
- Uma chave `GOOGLE_GENERATIVE_AI_API_KEY` do Google AI Studio.
- Um projeto Firebase com Auth anônimo, Google Auth, Firestore e Storage habilitados.

O repositório usa `npm` e mantém o lockfile em `package-lock.json`.

## Configuração Local

1. Instale as dependências:

```bash
npm install
```

2. Crie um arquivo `.env` ou `.env.local` na raiz com a chave do Google AI Studio e as variáveis do app web Firebase. Use `.env.example` como referência:

```env
GOOGLE_GENERATIVE_AI_API_KEY=sua_chave_aqui
VITE_FIREBASE_API_KEY=sua_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx
```

3. Rode o servidor de desenvolvimento:

```bash
npm run dev
```

4. Abra a URL exibida pelo Vite no terminal.

## Scripts

| Comando              | Descrição                                           |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Inicia o servidor de desenvolvimento.               |
| `npm run check`      | Typecheck + lint + testes. **O portão de entrega.** |
| `npm run test`       | Executa os testes.                                  |
| `npm run test:watch` | Testes em modo watch.                               |
| `npm run typecheck`  | Verifica os tipos sem gerar build.                  |
| `npm run build`      | Gera a build de produção.                           |
| `npm run build:dev`  | Gera build usando modo `development`.               |
| `npm run preview`    | Servir localmente a build gerada.                   |
| `npm run lint`       | Executa ESLint no projeto.                          |
| `npm run format`     | Formata os arquivos com Prettier.                   |

## Estrutura do Projeto

Organização **por domínio**. Detalhes e regras de cada camada em [`AGENTS.md`](AGENTS.md).

```text
src/
  features/             Domínios, cada um dono do seu código.
    auth/               Sessão (api.ts) e direitos de acesso (entitlements.ts).
    chat/               Conversas: model.ts (puro), api.ts (dados), components/.
    garage/             Ficha técnica do veículo.
  server/               Só roda no servidor — bloqueado no bundle do cliente.
    ai/                 Provider, prompt, preparo de mensagens e validação.
    config/env.ts       Segredos, validados na inicialização.
  shared/               Transversal, sem regra de negócio.
    config/env.ts       Variáveis VITE_* (públicas).
    lib/                Firebase, utilitários e tratamento de erros.
    hooks/  ui/         Hooks e componentes base.
  routes/               Rotas file-based do TanStack Router/Start.
  router.tsx            Configuração do roteador e QueryClient.
  server.ts             Entrada server-side com tratamento de erros SSR.
  start.ts              Configuração do TanStack Start e middleware de erro.
  styles.css            Design system, Tailwind e tema visual.
```

Regra prática: `model.ts` guarda lógica pura (é o que tem teste), `api.ts` guarda
acesso a dados, `components/` não acessa dados direto.

## Rotas Principais

| Rota           | Arquivo                       | Descrição                                                                             |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `/`            | `src/routes/index.tsx`        | Cria ou seleciona a conversa mais recente e redireciona para `/c/$threadId`.          |
| `/c/$threadId` | `src/routes/c.$threadId.tsx`  | Exibe a conversa de uma thread específica.                                            |
| `/api/chat`    | `src/routes/api/chat.ts`      | Endpoint server-side que envia mensagens para o Google AI Studio e retorna streaming. |
| `/sitemap.xml` | `src/routes/sitemap[.]xml.ts` | Rota de sitemap.                                                                      |

## Como o Chat Funciona

- `ChatWindow` usa `useChat` do AI SDK com `DefaultChatTransport` apontando para `/api/chat`.
- A rota `/api/chat` valida o payload, lê `GOOGLE_GENERATIVE_AI_API_KEY` no servidor, cria o provider do Google AI Studio e usa o modelo `gemini-3-flash-preview`.
- O chat aceita texto, imagens/fotos e áudio. Vídeo e outros arquivos são rejeitados no cliente e no servidor.
- Anexos são enviados para Firebase Storage em `users/{uid}/threads/{threadId}/attachments/*`; o Firestore mantém apenas a URL pública do arquivo na mensagem.
- O prompt de sistema define a persona do Mecânico de Fusca, o tom das respostas, limites do domínio e cuidados de segurança.
- `src/features/chat/api.ts` mantém as conversas em memória no runtime do navegador e sincroniza com Firestore em `users/{uid}/threads/{threadId}`.
- A ficha do veículo (`users/{uid}/vehicle/active`) vai como `body` em cada requisição e é injetada no prompt de sistema.
- Para conter custo, `src/server/ai/messages.ts` limita o histórico às 24 mensagens mais recentes e só embute anexos das 4 últimas, com cache por URL. Anexos mais antigos viram uma nota em texto.
- Antes do login, o app usa Firebase Auth anônimo para gerar um `uid` por navegador. Ao entrar com Google pela primeira vez, o app tenta vincular a conta Google ao usuário anônimo atual para preservar o histórico.
- Direitos de acesso (`isAdmin`, `plan`, assinatura) são **somente leitura** para o cliente: `firestore.rules` recusa qualquer escrita do navegador nesses campos. Quem os define é o servidor. Para marcar um admin hoje, edite `users/{uid}.isAdmin` pelo console do Firebase.

## Retenção de Anexos

- Os arquivos enviados para o Firebase Storage recebem metadado `expiresAt` com 48 horas a partir do upload.
- Para anexar imagens/áudios pelo navegador, aplique também a configuração CORS em `firebase-storage-cors.json` no bucket configurado em `VITE_FIREBASE_STORAGE_BUCKET`.
- Para apagar imagens e áudios automaticamente, aplique a lifecycle rule em `firebase-storage-lifecycle.json` no bucket configurado em `VITE_FIREBASE_STORAGE_BUCKET`.
- Firestore TTL não remove arquivos do Firebase Storage; ele só apaga documentos do Firestore. Como os anexos são objetos do Storage, a remoção deve ser feita pela lifecycle rule do bucket.

Com Google Cloud SDK instalado e autenticado:

```bash
gcloud storage buckets update gs://seu-projeto.firebasestorage.app --cors-file=firebase-storage-cors.json
gcloud storage buckets update gs://seu-projeto.firebasestorage.app --lifecycle-file=firebase-storage-lifecycle.json
```

Se publicar em um domínio de produção, adicione esse domínio à lista `origin` de `firebase-storage-cors.json` antes de aplicar a configuração.

Depois da regra aplicada, o Storage remove objetos em `users/` com idade maior ou igual a 2 dias. A exclusão não é instantânea no minuto exato das 48 horas; o Google Cloud processa lifecycle rules de forma assíncrona.

## Documentação de Trabalho

Este projeto está evoluindo para produto (app Android, assinatura, base vetorial).
Antes de contribuir, leia nesta ordem:

| Documento                                      | O que é                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                       | Regras de trabalho, estrutura e comandos.       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | O desenho alvo, problemas conhecidos e roteiro. |
| [`docs/CONTEXTO.md`](docs/CONTEXTO.md)         | Diário: decisões tomadas e estado real.         |

## Observações de Desenvolvimento

- As rotas seguem o padrão file-based do TanStack Start. Veja `src/routes/README.md` para as convenções.
- `src/routeTree.gen.ts` é gerado automaticamente e não deve ser editado manualmente.
- O alias `@/*` aponta para `src/*`.
- `vite.config.ts` usa plugins oficiais do Vite, TanStack Start, React, Tailwind, tsconfig paths e Nitro.

## Deploy

Para gerar a build de produção:

```bash
npm run build
```

Garanta que `GOOGLE_GENERATIVE_AI_API_KEY` esteja configurada no ambiente do servidor/plataforma onde a aplicação for publicada, e que as variáveis `VITE_FIREBASE_*` estejam disponíveis no build do frontend.
