# AGENTS.md

Regras de trabalho neste repositório. Leia antes de tocar em qualquer código.

**Produto:** Mecânico de Fusca — chatbot especialista em VW Fusca e motores boxer a ar.
**Destino:** produto pago. Web + app Android na Play Store, assinatura mensal.
**Idioma:** todo texto de produto, comentário e commit em português do Brasil.

## Leia nesta ordem

1. **`AGENTS.md`** (este arquivo) — como trabalhar.
2. **`docs/ARCHITECTURE.md`** — o desenho alvo, os problemas conhecidos e o roteiro por fases. É o norte.
3. **`docs/CONTEXTO.md`** — o diário: o que já foi feito, por quê, e o que está pendente. É o estado atual.

Se os três divergirem, `docs/CONTEXTO.md` descreve a realidade e os outros dois descrevem a intenção.

---

## Comandos

```bash
npm run dev        # servidor de desenvolvimento (porta 8080)
npm run check      # typecheck + lint + test — rode antes de entregar qualquer coisa
npm run test       # só os testes
npm run test:watch # testes em watch durante o desenvolvimento
npm run build      # build de produção
```

`npm run check` é o portão. Se não passar, o trabalho não está pronto.

---

## Estrutura

Organização **por domínio**, não por tipo de arquivo.

```
supabase/
├── migrations/         Schema + RLS. FONTE DA VERDADE do banco.
└── aplicar-*.sql       Gerados para o dono colar no SQL Editor. Não editar à mão.
src/
├── features/           Domínios. Cada um dono do seu próprio código.
│   ├── auth/           api.ts (Firebase, em aposentadoria) · supabase-auth.ts
│   │                   entitlements.ts (direitos, só leitura)
│   ├── chat/           api.ts · model.ts · hipoteses.ts · attachments.ts · components/
│   └── garage/         api.ts · model.ts (ficha)
│                       events.ts · events-api.ts (memória diagnóstica)
├── server/             NUNCA chega ao cliente. Protegido por vite.config.ts.
│   ├── ai/             provider · prompt · messages · schema · sistema · tools
│   └── config/env.ts   segredos, validados na inicialização
├── shared/             Transversal, sem regra de negócio.
│   ├── config/env.ts   variáveis VITE_* (públicas)
│   ├── lib/            supabase · database.types · firebase (legado) · utils · erros
│   ├── hooks/
│   └── ui/             componentes base (shadcn)
├── routes/             Roteamento file-based. Fino: só compõe features.
├── router.tsx  server.ts  start.ts  styles.css   ← pontos de entrada, não mova
└── routeTree.gen.ts    GERADO. Nunca edite à mão.
```

Durante a Fase 2, Firebase e Supabase coexistem. O estado exato da troca está em `docs/CONTEXTO.md` — leia antes de mexer em qualquer `api.ts`.

### Papel de cada camada

| Arquivo       | Contém                                      | Não contém                            |
| ------------- | ------------------------------------------- | ------------------------------------- |
| `model.ts`    | funções puras, tipos, constantes de domínio | qualquer I/O                          |
| `api.ts`      | acesso a dados, estado observável           | regra de negócio                      |
| `components/` | apresentação, consumo de hooks              | acesso direto a dados                 |
| `server/**`   | segredos, chamadas ao modelo, entitlements  | qualquer coisa importada pelo cliente |

**`model.ts` é onde mora o que tem teste.** Se algo está difícil de testar, provavelmente está na camada errada — mova para `model.ts` em vez de escrever mock.

### Ferramentas do agente

As duas ferramentas em `src/server/ai/tools.ts` são definidas **sem `execute`**. No AI SDK isso as torna ferramentas de _cliente_: o agente decide chamar, e quem executa é o navegador — em `onToolCall`, dentro de `ChatWindow.tsx`, onde existe a sessão autenticada do banco.

- `registrarEvento` — grava um marco no histórico do carro.
- `atualizarHipoteses` — publica o raciocínio no painel. Não tem efeito colateral: o estado é derivado das partes das mensagens (`features/chat/hipoteses.ts`). O prompt **exige** a chamada em todo turno de diagnóstico; se mexer no prompt, preserve essa regra ou o painel congela mostrando raciocínio velho.

Se for adicionar ferramenta nova, decida conscientemente de que lado ela roda:

- **Servidor** (com `execute`) — quando precisar de segredo ou de dado que o cliente não deve ver.
- **Cliente** (sem `execute`) — quando precisar da sessão do usuário. Evita dar credencial de administrador ao servidor.

O `inputSchema` da ferramenta e o tipo correspondente no cliente precisam andar juntos; hoje isso é manual e não há nada que force o alinhamento.

### Cuidado com o nome `server`

Existem duas coisas parecidas e diferentes:

- `src/server.ts` — entry de SSR, resolvido por caminho no `vite.config.ts`. **Não mova, não renomeie.**
- `src/server/` — módulos que só rodam no servidor. **Nunca crie um `src/server/index.ts`**: tornaria o import `./server` ambíguo e quebraria o build.

---

## Regras inegociáveis

1. **O servidor é a autoridade.** O cliente pede, o servidor decide. Vale dobrado para entitlements (`isAdmin`, `plan`, assinatura) e quota. O cliente **lê** direitos de acesso; nunca os escreve. Já foi quebrado uma vez — ver `docs/ARCHITECTURE.md` §3.2.

2. **Schema e regras no repositório.** `supabase/migrations/` é a fonte da verdade do banco (e `firestore.rules`/`storage.rules` do Firebase legado, enquanto existir). Nunca altere estrutura ou política pelo dashboard — ele não tem histórico nem revisão. Mudança de schema = migration nova + arquivo `aplicar-*.sql` regenerado para o dono.

3. **Nada de `as` para validar entrada.** Um cast não verifica nada em tempo de execução. Todo payload que cruza a fronteira da rede passa por zod. Ver `src/server/ai/schema.ts`.

4. **Custo de token é custo de produto.** Toda mudança no caminho do chat responde: quanto isso custa por mensagem? A janela de histórico e a janela de anexos em `src/server/ai/messages.ts` existem por isso — não as remova sem substituir por algo melhor.

5. **Peso é conversão.** Em APK, cada MB viaja no aparelho do usuário. Antes de adicionar dependência, rode `npm run build` e olhe o tamanho de `.output/public`. Hoje: ~2,3 MB. Se uma dependência dobrar isso, ela precisa justificar muito bem.

6. **Uma fase, um app funcionando.** Nada de big bang. Ver o roteiro em `docs/ARCHITECTURE.md` §5.

7. **O prompt é código.** `src/server/ai/prompt.ts` carrega o método de diagnóstico — é o que separa este produto de um chatbot genérico. Mexa nele com o mesmo cuidado de qualquer outro código: revisão, `PROMPT_VERSION` incrementada, e ciente de que não há eval automatizado ainda (ver pendências em `docs/CONTEXTO.md`).

8. **Não invente número.** Torque, folga e ponto errados quebram motor ou machucam alguém. O prompt instrui o agente a dar faixa e mandar conferir quando não tem certeza — não afrouxe isso, e aplique o mesmo critério ao conteúdo que você escrever para o RAG.

---

## O dono do projeto

O dono (Diogo) **não é desenvolvedor**. Regras de comunicação, aprendidas na prática:

- **Escreva pouco.** Toda resposta termina com uma seção **"Preciso de você"** listando ações concretas e numeradas — ou dizendo explicitamente que não há nenhuma. Detalhe técnico vai para `docs/CONTEXTO.md`, não para o chat.
- **Nada de CLI para ele.** SQL vai por arquivo único (`begin`/`commit`) que ele cola no SQL Editor do dashboard e roda uma vez. Passo a passo numerado, um clique por item, com o que esperar de resultado ("faixa verde" / "faixa vermelha").
- **Segredos nunca circulam no chat.** Instrua onde colar (`.env`, dashboard); nunca peça o valor. A `sb_secret_` e o client secret do Google já seguiram esse fluxo.
- Se uma tela dele não bater com a instrução, peça print e oriente pelo que estiver aparecendo.

## Roadmap operacional

`docs/roadmap.html` é a ordem de serviço viva do projeto, publicada como artifact em
`https://claude.ai/code/artifact/51f63405-c8a9-46ef-b329-41bf587457f9`.

**Regra acordada com o dono:** fez algo que está na lista → marca como feito. Algo mudou o plano → altera a lista. Sempre na fonte (`BASE` dentro do HTML), nunca só na conversa.

**Mecânica:** toda mudança na `BASE` exige incrementar `VERSAO` (no mesmo arquivo) e republicar o artifact na mesma URL. Sem o incremento, o navegador do dono ignora a mudança. As marcações dele são preservadas por id na mesclagem. A sincronia é de mão única — o que ele marca no navegador não volta sozinho; ele avisa no chat ou exporta o JSON.

---

## Como trabalhar

**Antes de começar:** leia `docs/CONTEXTO.md` para saber onde o trabalho parou e o que está pendente.

**Ao mudar comportamento:** escreva ou atualize o teste primeiro, em `model.ts`. Testes cobrem lógica pura; não escreva teste que faz mock do Firebase.

**Ao terminar:** rode `npm run check`. Depois atualize `docs/CONTEXTO.md` (regras abaixo).

**Ao encontrar um problema fora do escopo:** não conserte de passagem. Registre em `docs/CONTEXTO.md` na seção "Pendências conhecidas" e siga com o que estava fazendo.

**Ao discordar de uma decisão registrada:** ela foi tomada com um motivo que está escrito. Leia o motivo. Se ainda discordar, converse com o dono do projeto antes de reverter — não reverta silenciosamente.

### Commits

- Português, imperativo, escopo claro: `Corrige custo de anexos no histórico do chat`.
- Um commit por mudança lógica. Não misture movimentação de arquivo com mudança de comportamento — fica impossível de revisar.

---

## Manutenção do `docs/CONTEXTO.md`

Esse arquivo é a memória do projeto entre sessões e entre agentes. Ele só serve se for mantido.

**Atualize quando:**

- terminar um bloco de trabalho relevante (não a cada arquivo salvo);
- tomar uma decisão técnica com alternativa descartada;
- descobrir um problema que não vai consertar agora;
- descobrir que algo documentado está errado.

**Como escrever:**

- Registre o **porquê**, não o **o quê**. O `git log` já tem o "o quê".
- Datas absolutas (`2026-07-25`), nunca "ontem" ou "semana passada".
- Aponte para arquivo e linha quando for específico.
- Decisão descartada vale tanto quanto a adotada: escreva o que você **não** fez e por quê. É o que evita alguém refazer o caminho errado.
- Entrada nova entra no topo da seção, com data.

**Não escreva lá:**

- o que o código já diz (estrutura de pastas, nomes de função);
- o que o `git log` já diz (lista de arquivos alterados);
- detalhe efêmero de uma conversa.

**Poda:** quando uma pendência for resolvida, mova-a para o histórico com a data e como foi resolvida — não deixe pendência morta na lista. Quando uma seção passar de ~40 linhas, condense as entradas antigas em um parágrafo de resumo.
