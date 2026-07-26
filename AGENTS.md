# AGENTS.md

Regras de trabalho neste repositório. Leia antes de tocar em qualquer código.

**Produto:** Mecânico de Fusca — chatbot especialista em VW Fusca e motores boxer a ar.
**Destino:** produto pago. Web + app Android na Play Store, assinatura mensal.
**Idioma:** todo texto de produto, comentário e commit em português do Brasil.

## Leia nesta ordem

1. **`AGENTS.md`** (este arquivo) — como trabalhar.
2. **`docs/ARCHITECTURE.md`** — o desenho alvo, os problemas conhecidos e o roteiro por fases. É o norte.
3. **`docs/CONTEXTO.md`** — o diário: o que já foi feito, por quê, e o que está pendente. É o estado atual.

Se os três divergirem, `docs/CONTEXTO.md` descreve a realidade e os outros dois descrevem a intenção. Corrija o que estiver errado.

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
src/
├── features/           Domínios. Cada um dono do seu próprio código.
│   ├── auth/           api.ts (sessão) · entitlements.ts (direitos, só leitura)
│   ├── chat/           api.ts · model.ts · attachments.ts · components/
│   └── garage/         api.ts · model.ts (ficha)
│                       events.ts · events-api.ts (memória diagnóstica)
├── server/             NUNCA chega ao cliente. Protegido por vite.config.ts.
│   ├── ai/             provider · prompt · messages · schema · sistema · tools
│   └── config/env.ts   segredos, validados na inicialização
├── shared/             Transversal, sem regra de negócio.
│   ├── config/env.ts   variáveis VITE_* (públicas)
│   ├── lib/            firebase · utils · erros
│   ├── hooks/
│   └── ui/             componentes base (shadcn)
├── routes/             Roteamento file-based. Fino: só compõe features.
├── router.tsx  server.ts  start.ts  styles.css   ← pontos de entrada, não mova
└── routeTree.gen.ts    GERADO. Nunca edite à mão.
```

### Papel de cada camada

| Arquivo       | Contém                                      | Não contém                            |
| ------------- | ------------------------------------------- | ------------------------------------- |
| `model.ts`    | funções puras, tipos, constantes de domínio | qualquer I/O                          |
| `api.ts`      | acesso a dados, estado observável           | regra de negócio                      |
| `components/` | apresentação, consumo de hooks              | acesso direto a dados                 |
| `server/**`   | segredos, chamadas ao modelo, entitlements  | qualquer coisa importada pelo cliente |

**`model.ts` é onde mora o que tem teste.** Se algo está difícil de testar, provavelmente está na camada errada — mova para `model.ts` em vez de escrever mock.

### Ferramentas do agente

`registrarEvento` (`src/server/ai/tools.ts`) é definida **sem `execute`**. No AI SDK isso a torna ferramenta de _cliente_: o agente decide chamar, e quem grava é o navegador — em `onToolCall`, dentro de `ChatWindow.tsx`, onde existe a sessão autenticada do Firestore.

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

2. **Schema e regras no repositório.** `firestore.rules`, `storage.rules` e (na Fase 2) as migrations do Supabase são a fonte da verdade. Nunca altere estrutura ou regra pelo console — o console não tem histórico nem revisão.

3. **Nada de `as` para validar entrada.** Um cast não verifica nada em tempo de execução. Todo payload que cruza a fronteira da rede passa por zod. Ver `src/server/ai/schema.ts`.

4. **Custo de token é custo de produto.** Toda mudança no caminho do chat responde: quanto isso custa por mensagem? A janela de histórico e a janela de anexos em `src/server/ai/messages.ts` existem por isso — não as remova sem substituir por algo melhor.

5. **Peso é conversão.** Em APK, cada MB viaja no aparelho do usuário. Antes de adicionar dependência, rode `npm run build` e olhe o tamanho de `.output/public`. Hoje: ~2,3 MB. Se uma dependência dobrar isso, ela precisa justificar muito bem.

6. **Uma fase, um app funcionando.** Nada de big bang. Ver o roteiro em `docs/ARCHITECTURE.md` §5.

7. **O prompt é código.** `src/server/ai/prompt.ts` carrega o método de diagnóstico — é o que separa este produto de um chatbot genérico. Mexa nele com o mesmo cuidado de qualquer outro código: revisão, `PROMPT_VERSION` incrementada, e ciente de que não há eval automatizado ainda (ver pendências em `docs/CONTEXTO.md`).

8. **Não invente número.** Torque, folga e ponto errados quebram motor ou machucam alguém. O prompt instrui o agente a dar faixa e mandar conferir quando não tem certeza — não afrouxe isso, e aplique o mesmo critério ao conteúdo que você escrever para o RAG.

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
