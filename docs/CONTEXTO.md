# Contexto e Memória do Projeto

Diário de decisões e estado real do trabalho. Complementa `docs/ARCHITECTURE.md` (o alvo) e `AGENTS.md` (as regras). **As regras de manutenção deste arquivo estão em `AGENTS.md` — leia antes de editar.**

Entrada nova vai no topo de cada seção, com data absoluta.

---

## Onde o trabalho está

**Fase atual: FASE 2 (migração para Supabase), NO MEIO.** O app ainda roda 100% em Firebase; a fundação do Supabase está pronta e verificada, mas a troca da camada de dados **não começou**. Quem assumir daqui continua exatamente deste ponto.

### O que já está feito na Fase 2 (2026-07-26)

- **Migrations 1–5 escritas e APLICADAS no banco real** (`supabase/migrations/`, aplicadas via `supabase/aplicar-tudo.sql` no SQL Editor). 10 tabelas, RLS em todas.
- **RLS verificada com testes reais** (dois usuários anônimos criados via API): isolamento entre usuários confirmado, escrita de `is_admin` negada (grant de coluna), escrita em `subscriptions` negada (sem política = negado por padrão), trigger de criação de perfil funcionando.
- **Providers ligados no dashboard:** Anonymous e Google (verificado via `/auth/v1/settings`). Região confirmada: São Paulo.
- **Código escrito:** `shared/lib/supabase.ts` (cliente), `shared/lib/database.types.ts` (tipos, à mão), `features/auth/supabase-auth.ts` (anônimo + Google via `linkIdentity`, preservando histórico ao logar). Env validada com as chaves novas (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` — as três já estão no `.env` do dono).

### O que falta na Fase 2, em ordem

~~1. Aplicar migrations 6 e 7~~ — **feito em 2026-07-26.** Todas as 7 migrations estão aplicadas; o bucket `anexos` existe. (A primeira versão da 6 falhou com `42804` — a FK de `attachments.message_id` impedia mudar o tipo de um lado só; corrigida para arrastar os dois.)

2. **Trocar a camada de dados:** reescrever `features/chat/api.ts`, `features/garage/api.ts` e `features/garage/events-api.ts` sobre Supabase usando **TanStack Query** (já é dependência, sem uso). Upload de anexos vai para o bucket `anexos` (caminho `uid/threadId/...` — a política exige o uid como primeira pasta). Componentes trocam os imports; `entitlements.ts` passa a ler a linha de `profiles`.
3. **Trocar o login nos componentes** para `supabase-auth.ts` e **testar Google de ponta a ponta** (exige clique do dono — nunca foi testado, só o provider foi confirmado ligado).
4. **Aposentar o Firebase:** remover arquivos e dependência só depois do passo 3 validado.
5. Exclusão de conta (função `apagar_conta` já existe na migration 5; falta endpoint + UI + limpeza do bucket antes do delete).

### Fatos do ambiente

- **Supabase:** projeto `ougesilqshtsgpnfmdaw`, região São Paulo, chaves novas (`sb_publishable_` / `sb_secret_`), **não** as legadas. Dashboard: `https://supabase.com/dashboard/project/ougesilqshtsgpnfmdaw`.
- **Firebase (legado, ainda em uso):** projeto `suporte-24h`. As `firestore.rules` do repositório **nunca foram aplicadas** ao projeto — irrelevante se a migração concluir, mas se algo atrasar, aplicar.
- **Só existe o perfil do dono para migrar** — decisão dele: sem script de migração de dados, começar limpo no Supabase.
- **Lixo de teste no banco:** 3+ usuários anônimos e uma thread "Fusca esquentando", criados pelos testes de RLS. Limpar quando conveniente (Dashboard → Authentication → Users).
- **Branch:** `reestruturacao-fase-1`, com remote em `github.com/3uild3d2/mecanico-de-fusca`. O bloco da fundação Supabase foi commitado e enviado em 2026-07-26.

**Decisões do RAG já tomadas (Fase 3):** embeddings `gemini-embedding-001` a **768 dimensões** — já gravado no schema (`chunks.embedding vector(768)`). Conteúdo será pesquisado e redigido em conjunto com o dono, em markdown com front matter dentro do repositório, começando por um tópico piloto.

---

## Pendências conhecidas

Coisas encontradas e deliberadamente não resolvidas ainda. Não são esquecimento.

- **`database.types.ts` é escrito à mão.** Não é verificado contra o banco: se divergir do SQL, o TypeScript mente. Regenerar assim que possível com `npx supabase gen types typescript --project-id ougesilqshtsgpnfmdaw` (exige login no CLI, que ainda não foi feito nesta máquina).

- **Limpeza de anexos expirados não existe no Supabase.** O Firebase usava lifecycle rule do bucket; o Supabase Storage não tem equivalente. `attachments.expira_em` já registra o prazo — falta uma rotina (pg_cron chamando a API do Storage, ou job externo) que apague os objetos vencidos. Sem isso, o bucket cresce para sempre.

- **Login Google no Supabase nunca foi testado de ponta a ponta.** Provider ligado, credencial colada, redirect URI configurada — mas ninguém clicou no botão ainda. O fluxo `linkIdentity` (anônimo → Google preservando histórico) é o ponto com maior chance de surpresa.

- **Sem eval do raciocínio.** Mexer em prompt de diagnóstico sem medição é palpite, e regressão em raciocínio é invisível até um usuário reclamar. Falta um conjunto de ~20 casos com desfecho conhecido, rodado a cada mudança, medindo: chegou à conclusão certa? em quantos turnos? descartou hipótese por evidência ou por preferência? Os casos podem sair do próprio acervo do RAG.

- **Nenhuma UI para o histórico.** O agente registra e o histórico vira contexto, mas o dono não tem tela para ver, editar ou apagar os eventos. `removerEvento` já existe em `events-api.ts` e não está ligada a nada. Antes de qualquer usuário real, isso precisa existir — registro automático sem forma de corrigir é armadilha.

- **`registrarEvento` sem confirmação.** O agente grava direto, por decisão de UX (o fluxo "manda áudio e está registrado" morre se pedir confirmação). O contrapeso previsto era poder apagar depois — que depende da pendência acima. Até lá, registro errado fica preso.

- **Ferramenta obedecida por prompt, não por garantia.** `atualizarHipoteses` depende de o modelo decidir chamá-la. Duas rodadas de ajuste foram necessárias para ele chamar em todos os turnos, e nada impede uma regressão silenciosa: se ele parar de chamar, o painel congela mostrando raciocínio velho. Uma trava possível seria detectar diagnóstico no servidor e usar `toolChoice: "required"` — mas a detecção é heurística e forçaria a chamada em procedimento e especificação, onde o painel não deve aparecer.

- **Painel sem estado de carregamento.** Enquanto o modelo pensa, o painel mostra o estado anterior sem indicar que está desatualizado. Numa reordenação grande de pesos isso confunde.

- **Exclusão de conta não existe na interface.** Requisito de publicação na Play Store (in-app + URL pública). Bloqueia o lançamento. A função `apagar_conta` já existe no banco (migration 5, só executável pelo servidor) — falta o endpoint, a UI e a limpeza do bucket `anexos` antes do delete (o cascade do Postgres não apaga objetos do Storage).

- **`is_admin` de ninguém está ligado.** O campo agora vive em `profiles.is_admin`, que só o servidor escreve. Como ainda não existe servidor escrevendo, o selo de admin não aparece para ninguém. Para ativar manualmente: SQL Editor → `update profiles set is_admin = true where email = '...'`. A solução definitiva vem com o billing, na Fase 5.

- **Persistência da thread reescreve tudo.** `saveThreadMessages` grava o documento inteiro (todas as mensagens) a cada 600 ms durante o streaming. Ineficiente e caro em escritas. Some na Fase 2, quando `messages` virar tabela com uma linha por mensagem.

- **Store manual em vez de TanStack Query.** `features/*/api.ts` usa `useSyncExternalStore` escrito à mão. `@tanstack/react-query` já é dependência e está sem uso. A troca acontece na Fase 2, junto com a mudança de backend — fazer antes seria reescrever duas vezes.

- **Sem observabilidade.** Só `console.error`. Com usuário pagante, erro que ninguém vê não existe. Escolher e plugar (Sentry ou equivalente) antes do lançamento.

- **Sem rate limiting.** Qualquer um com a URL da API pode consumir a chave do Google AI Studio. Urgente a partir do momento em que o app for público. Fase 5, ou antes se publicar.

- **`zod` na v3.** O AI SDK v6 tende a v4. Não deu conflito porque usamos zod isolado, mas vale alinhar quando mexer nas dependências.

---

## Decisões

### 2026-07-26 — Fundação Supabase aplicada e verificada

As migrations 1–5 rodaram no banco real e a segurança foi testada de verdade, não presumida: dois usuários anônimos criados via API, e as nove checagens passaram — isolamento entre usuários (B não vê thread de A), `is_admin` recusado com erro `42501` (prova de que o `revoke`/`grant` por coluna funcionou), `subscriptions` recusada por ausência de política, `display_name` permitido, trigger de perfil disparando.

**Entitlement em duas camadas** é a diferença estrutural em relação ao Firebase: RLS decide quais _linhas_, `GRANT` por coluna decide quais _campos_. A falha original do `isAdmin` (cliente escrevendo o próprio direito) agora é impossível por construção.

**Decisões de schema tomadas depois da primeira aplicação:**

- `messages.id` vira **text** (migration 6): o id é gerado pelo AI SDK no navegador (`msg-...`), não uuid. Guardar o id do SDK permite gravar por upsert — idempotente mesmo com reconexão. Alternativa descartada: coluna extra só para o id do cliente (uma chave a mais para sincronizar, sem ganho).
- Bucket `anexos` com **leitura pública** (migration 7): paridade com o Firebase — a URL fica dentro da mensagem e `/api/chat` a baixa sem sessão; o nome do objeto carrega uuid, então não é adivinhável. Alternativa (signed URLs) daria expiração de verdade, mas complicaria o servidor; reavaliar se o produto mudar de postura. Escrita: só o dono, só na pasta `uid/...`.

Essas duas ainda **não foram aplicadas** — estão em `supabase/aplicar-pendentes.sql`, aguardando o dono.

### 2026-07-26 — Como trabalhar com o dono do projeto

O dono **não é desenvolvedor**. Isso mudou o fluxo de trabalho e precisa ser respeitado por quem assumir:

- **Nada de CLI.** Aplicação de SQL é por arquivo único (`begin`/`commit`) colado no SQL Editor do dashboard, com instruções passo a passo numeradas, uma ação por item. Foi assim que as migrations 1–5 entraram; `aplicar-pendentes.sql` segue o padrão.
- **Toda resposta termina com "Preciso de você"** listando ações concretas, ou dizendo explicitamente que não há nenhuma. Ele avisou (2026-07-26) que no meio de texto longo não distingue relato de problema de pedido de ação.
- **Segredos nunca circulam no chat.** A `sb_secret_` e o client secret do Google foram colados direto pelo dono nos destinos. Instruir onde colar, nunca pedir o valor.
- **O roadmap é contrato de trabalho** (ver decisão abaixo): fez algo da lista, marca; mudou o plano, atualiza a lista.

### 2026-07-26 — Roadmap interativo com estado versionado

`docs/roadmap.html` é a ordem de serviço do projeto, publicada como artifact (URL em `AGENTS.md`). A lista-fonte (`BASE`) vive no próprio arquivo, versionada no git; as marcações do dono ficam no localStorage do navegador dele e **são mescladas por id** quando a `VERSAO` publicada é maior que a salva — os textos novos entram, as marcações e tarefas próprias dele permanecem.

**Regra de manutenção:** toda alteração na `BASE` incrementa `VERSAO` e republica o artifact (mesma URL, via parâmetro `url`). Sem o incremento, o navegador do dono ignora a mudança silenciosamente.

**Limite conhecido:** a sincronia é de mão única (repositório → navegador dele). O que ele marca lá não chega ao repositório sozinho — ele avisa no chat ou exporta o JSON. Alternativa descartada: estado compartilhado no artifact — as capacidades disponíveis (`downloads`, `mcp`) não incluem persistência.

### 2026-07-25 — Painel de raciocínio

Torna visível o que o agente está pensando: hipóteses vivas com peso, o que refutaria cada uma, e as descartadas com o motivo. Transforma o método em interface, ensina o dono a diagnosticar e é algo que chatbot genérico não faz.

**O estado não tem armazenamento próprio.** Ele é derivado das chamadas da ferramenta `atualizarHipoteses`, que já vivem nas partes das mensagens. Consequências, todas boas: persiste junto com a thread sem tabela nova, sobrevive a recarregar a página, e o histórico do raciocínio fica auditável — dá para ver como as hipóteses evoluíram, não só onde pararam.

**Alternativa descartada:** saída estruturada via `generateObject`. Conflitaria com o streaming da prosa, e a ferramenta já resolvia com a infraestrutura montada uma hora antes.

**Três bugs encontrados só porque o app foi realmente aberto**, nenhum deles visível em typecheck ou teste:

1. **Faltava `sendAutomaticallyWhen`.** Sem ele o `useChat` grava o resultado da ferramenta e para — nada reenvia ao servidor, então o modelo nunca continua. Sintoma: bolha de assistente vazia e um único POST em `/api/chat`. **Isso afetava também o `registrarEvento`**, entregue antes sem teste de ponta a ponta; estava quebrado desde então.

2. **O modelo ignorava a ferramenta.** A instrução estava numa seção separada e ele narrava as hipóteses em prosa — exatamente o que o prompt pedia para não fazer. Resolveu ao mover a ordem para dentro do passo 1 do laço, colada à ação.

3. **O painel congelava depois do primeiro turno.** O modelo chamava a ferramenta na abertura e não nas reduções seguintes: o texto descartava hipóteses corretamente enquanto o painel seguia mostrando todas vivas. Painel desatualizado é pior que painel nenhum. Resolveu com uma regra incondicional no topo do método — "toda resposta num diagnóstico começa chamando `atualizarHipoteses`".

Esses três reforçam a pendência do eval: foram descobertos por anedota, um caso de cada vez. Sem medição, a próxima regressão passa batido.

### 2026-07-25 — Método de diagnóstico, falseamento e memória do carro

Três mudanças que respondem à mesma pergunta: o que faz este agente valer assinatura em vez de ser Gemini com um prompt bonito.

**Método em vez de formatação.** O prompt anterior dizia "apresente as causas mais prováveis primeiro" — instrução de formato, não de raciocínio. Agora há um laço explícito: hipóteses → falseamento → perguntas → redução → testes → conclusão.

O detalhe que faz funcionar é a **triagem antes do laço**. Diagnóstico, procedimento, especificação e conversa recebem tratamentos diferentes. Sem isso, quem pergunta "como regulo as válvulas" ouviria "tenho três hipóteses, me conte mais" — e desistiria do app. É o que torna o fluxo orientador em vez de camisa de força.

**Falseamento como regra operacional.** Para cada hipótese o agente precisa responder a si mesmo "o que provaria que NÃO é isso?", e ao propor teste deve preferir o que _distingue_ hipóteses ao que apenas confirma a favorita. Combate viés de confirmação, que num diagnóstico se manifesta como mandar trocar peça sem evidência — dinheiro do dono.

**Histórico como memória diagnóstica, não diário de manutenção.** A distinção é do dono do projeto e muda o modelo inteiro: o usuário abre o app para resolver problema, então o histórico existe para virar contexto no próximo diagnóstico.

Consequências de desenho, todas deliberadas:

- **Desfecho desconhecido é o caso comum e continua valendo.** "Identificamos problema na bobina — sem confirmação de que foi resolvido" é informação legítima: diz que este carro já teve suspeita naquele sistema. Exigir que o usuário feche o ciclo faria o histórico morrer por atrito.
- **Uma linha curta por evento.** Não é estética: o histórico entra no contexto de toda conversa, então linha longa é custo por mensagem que se paga para sempre.
- **Detecção de recorrência.** Dois ou mais episódios no mesmo sistema disparam alerta no prompt — se o sintoma voltou, a solução anterior não resolveu, ou a causa real está a montante. É o sinal de maior valor que só o histórico fornece.
- **Filtro por sistema** (`server/ai/sistema.ts`): heurística determinística e testável, não classificação por modelo. Errar ali degrada relevância do histórico, não a resposta.

**Alternativa descartada:** registro manual pelo usuário na tela da garagem. Diário de manutenção alimentado à mão morre por abandono — é padrão conhecido. O agente registra sozinho quando o dono relata um serviço ("troquei as 4 velas", inclusive por áudio, com a data derivada do momento) ou quando um diagnóstico chega a uma suspeita.

**Consequência arquitetural:** isso exigiu _tool calling_, que o app não tinha. `registrarEvento` é definida **sem `execute`**, o que no AI SDK a torna ferramenta de cliente: o agente decide, o navegador grava. O motivo é concreto — a sessão autenticada do Firestore existe no cliente, e dar credencial de administrador ao servidor só para isso seria ampliar a superfície de risco sem necessidade.

**Persistência em Firestore, sabendo que é temporário.** `events-api.ts` será reescrito na Fase 2. Aceitei o retrabalho porque a separação `model.ts`/`api.ts` deixa `events.ts` — modelo, formatação, seleção de contexto, recorrência — 100% portável. São ~100 linhas de I/O descartáveis em troca da funcionalidade valendo agora em vez de depois da migração inteira.

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

- **2026-07-25** — Logo de 346 KB (PNG) → 37 KB (JPEG fornecido pelo dono do projeto), 89% menor. Os componentes ainda declaram `width={1024} height={1024}`; se o novo arquivo não for quadrado, há leve deslocamento de layout antes de carregar.
- **2026-07-25** — Zero testes → 62 testes cobrindo título de conversa, ficha do veículo e preparo de mensagens. Vitest configurado em `vitest.config.ts`, separado do `vite.config.ts` de propósito (os testes não devem carregar os plugins de SSR/Nitro).
- **2026-07-25** — Zero validação → zod no payload de `/api/chat` e nas variáveis de ambiente, com erro legível na inicialização em vez de quebrar quando o usuário abre o chat.
- **2026-07-25** — 45 dependências → 35. Removidos 17 pacotes Radix, `recharts`, `embla-carousel-react`, `react-day-picker`, `input-otp`, `vaul`, `react-resizable-panels`, `react-hook-form`, `@hookform/resolvers`, `react-markdown`, `date-fns` e 3 plugins do Streamdown. Junto, 34 componentes `ui/` órfãos do scaffold do shadcn.
- **2026-07-25** — Sem CI → `.github/workflows/ci.yml` com typecheck, lint, test e build.
