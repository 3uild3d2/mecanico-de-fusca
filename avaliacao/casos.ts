import type { VehicleProfile } from "@/features/garage/model";
import type { Desfecho, SistemaVeiculo, TipoEvento } from "@/features/garage/events";

// Bateria de casos do Mecânico de Fusca.
//
// Mede o MÉTODO do prompt, não só a resposta final: triagem (só levantar
// hipóteses em diagnóstico), uso da ficha e do histórico, abandono da hipótese
// favorita diante de evidência, separação entre suspeita e confirmação,
// alerta de segurança e recusa a inventar número.
//
// Conteúdo RASCUNHADO pelo agente em 2026-10-04 e ainda NÃO revisado pelo dono.
// Regra 8 do AGENTS.md vale aqui: nenhum caso afirma torque, folga ou ponto —
// onde há número, o que se avalia é se o mecânico manda conferir.
//
// As falas do dono são roteiro fixo: a evidência chega na mesma ordem para
// todos os modelos, senão a comparação não vale. Cada fala é enviada depois da
// resposta do mecânico à anterior.

export type Categoria = "diagnostico" | "procedimento" | "especificacao" | "conversa";

export type EventoDeHistorico = {
  tipo: TipoEvento;
  titulo: string;
  sistema?: SistemaVeiculo;
  desfecho?: Desfecho;
  diasAtras: number;
};

export type Caso = {
  id: string;
  titulo: string;
  categoria: Categoria;
  /** O que o caso mede, em uma linha — aparece no relatório. */
  mede: string;
  veiculo: VehicleProfile | null;
  historico?: EventoDeHistorico[];
  /** Falas do dono, na ordem. */
  falas: string[];
  esperado: {
    /** Causa conhecida. Ausente em casos que não são diagnóstico. */
    causa?: string;
    /** Critérios para o juiz: o que uma boa resposta faz. */
    criterios: string[];
    /** O que uma boa resposta NÃO faz. */
    naoDeve: string[];
    /** Se o mecânico registrar um diagnóstico, quais desfechos são aceitáveis. */
    desfechosAceitos?: Desfecho[];
  };
  /** Confiança do autor no conteúdo técnico — guia a revisão do dono. */
  confianca: "alta" | "media";
  /** O que o dono deve conferir com mais atenção. */
  duvida?: string;
  /** Vira true quando o dono revisar. Só casos revisados contam no placar final. */
  revisado: boolean;
};

const FUSCA_1300_SOLEX: VehicleProfile = {
  modelo: "Fusca",
  ano: "1976",
  motor: "1300",
  carburacao: "Solex simples",
  combustivel: "gasolina",
  ignicao: "platinado",
  sistema_eletrico: "12V",
};

export const CASOS: Caso[] = [
  // ---------------------------------------------------------------- diagnóstico
  {
    id: "bomba-aceleracao",
    titulo: "Engasga ao pisar fundo de repente",
    categoria: "diagnostico",
    mede: "Usa o padrão do sintoma (só no pisão) para separar mistura transitória de ignição",
    veiculo: FUSCA_1300_SOLEX,
    falas: [
      "Meu Fusca dá uma engasgada quando eu piso fundo no acelerador de repente. Em marcha lenta fica redondinho.",
      "Se eu acelero devagarinho ele sobe de giro normal, sem falhar. A falha é só quando piso de uma vez. Na estrada, em velocidade constante, anda bem.",
      "Tirei o filtro de ar e olhei dentro do carburador acelerando com o motor desligado: não sai esguicho nenhum de gasolina.",
    ],
    esperado: {
      causa:
        "Bomba de aceleração do carburador sem esguicho (diafragma danificado ou esguichador entupido).",
      criterios: [
        "Inclui a bomba de aceleração entre as hipóteses desde o início.",
        "Usa o fato de a falha ocorrer só no pisão (e não em aceleração lenta nem em velocidade constante) para enfraquecer causas de ignição.",
        "Conclui pela bomba de aceleração após o teste sem esguicho.",
        "Sugere reparar a bomba (kit/diafragma, desentupir o esguichador) antes de cogitar trocar o carburador.",
      ],
      naoDeve: [
        "Mandar trocar o carburador inteiro sem teste que o incrimine.",
        "Afirmar que o diagnóstico está confirmado antes de o reparo resolver.",
      ],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "correia-frouxa",
    titulo: "Perde força, cheiro de quente e luz da bateria acesa",
    categoria: "diagnostico",
    mede: "Liga dois sintomas a uma causa comum e prioriza a segurança do motor",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1980", motor: "1600" },
    falas: [
      "Estava na estrada e o carro começou a perder força, e o motor está com cheiro de quente.",
      "A luz vermelha da bateria acendeu no painel também. A do óleo ainda não acendeu.",
      "Abri a tampa do motor: a correia está lá, mas bem frouxa, dá pra torcer com a mão fácil.",
    ],
    esperado: {
      causa:
        "Correia frouxa patinando: a ventoinha gira menos (superaquecimento) e o gerador não carrega (luz da bateria).",
      criterios: [
        "Ao saber da luz da bateria junto com o aquecimento, aponta a correia como causa comum aos dois sintomas.",
        "Alerta para parar e não seguir rodando com o motor superaquecendo, pelo risco de dano grave ao motor.",
        "Orienta tensionar a correia (no Fusca, pelos calços da polia do gerador) e conferir se ela não está gasta.",
      ],
      naoDeve: [
        "Tratar a luz da bateria e o aquecimento como dois problemas independentes depois da segunda fala.",
        "Dizer que pode seguir viagem normalmente.",
      ],
      desfechosAceitos: ["suspeita", "confirmado", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "malha-terra",
    titulo: "Motor de partida gira devagar com bateria nova",
    categoria: "diagnostico",
    mede: "Usa o comportamento do farol para separar bateria fraca de resistência no circuito",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1978" },
    falas: [
      "Viro a chave e o motor de partida gira bem devagar, quase não pega. A bateria é nova, de duas semanas.",
      "Fiz o teste de dar partida com o farol aceso: o farol continua forte, quase não enfraquece. Os terminais da bateria parecem limpos.",
      "Achei a cordoalha de cobre que liga o câmbio à carroceria bem esverdeada e com fios partidos.",
    ],
    esperado: {
      causa:
        "Resistência no circuito de partida por aterramento ruim: cordoalha de terra do câmbio oxidada e partida.",
      criterios: [
        "Explica que farol forte durante a partida aponta para resistência no circuito (cabos, terra, automático) e enfraquece a hipótese de bateria fraca.",
        "Conclui pela cordoalha de terra e manda trocá-la e limpar os pontos de contato.",
      ],
      naoDeve: [
        "Insistir em trocar ou carregar a bateria depois da segunda fala.",
        "Mandar trocar o motor de partida sem antes resolver o aterramento.",
      ],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "vapor-lock",
    titulo: "Morre quente e só pega depois de esfriar",
    categoria: "diagnostico",
    mede: "Propõe o teste que distingue as hipóteses em vez do que confirma a favorita",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1982", motor: "1600" },
    falas: [
      "No calor, depois de rodar um tempo no trânsito, meu Fusca morre e não pega mais. Se eu espero uns 20 minutos esfriar, pega normal.",
      "A centelha parece boa mesmo quando ele morre, testei com uma vela fora do motor.",
      "Coloquei um pano molhado em cima da bomba de gasolina e pegou na hora.",
    ],
    esperado: {
      causa:
        "Vaporização do combustível na bomba ou na linha (vapor lock), por calor excessivo na bomba mecânica.",
      criterios: [
        "Considera tanto ignição aquecida (bobina) quanto vaporização de combustível no início.",
        "Usa a centelha boa para enfraquecer a hipótese de ignição.",
        "Conclui por vaporização após o teste do pano molhado e sugere verificar o isolante da bomba e afastar mangueiras de fontes de calor.",
      ],
      naoDeve: ["Mandar trocar a bobina depois da segunda fala sem novo indício."],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "media",
    duvida:
      "Confira se a solução que você usaria é mesmo o isolante (calço) da bomba e o afastamento das mangueiras, ou se há outra prática mais comum.",
    revisado: false,
  },
  {
    id: "folga-valvulas",
    titulo: "Tec-tec no motor, mais forte frio",
    categoria: "diagnostico",
    mede: "Diagnóstico com pedido de número no meio: não pode inventar a folga",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1975" },
    falas: [
      "Tem um barulho de tec-tec-tec no motor que acompanha a rotação. Fica mais forte com o motor frio.",
      "Não lembro quando regularam as válvulas pela última vez, faz uns dois anos. O barulho parece vir das laterais do motor, dos dois lados.",
      "Qual é a folga certa das válvulas pra eu regular?",
    ],
    esperado: {
      causa: "Folga excessiva nas válvulas por falta de regulagem.",
      criterios: [
        "Aponta folga de válvulas como hipótese principal, pelo som que acompanha a rotação e pela falta de regulagem.",
        "Ao responder a folga, informa de que ela depende (motor, ano) e manda conferir no manual ou na especificação do motor.",
        "Orienta que a regulagem é feita com o motor frio.",
      ],
      naoDeve: [
        "Afirmar um único valor de folga como certo, sem fonte nem ressalva.",
        "Mandar abrir o motor antes de tentar a regulagem.",
      ],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "freio-puxando",
    titulo: "Puxa para a esquerda ao frear",
    categoria: "diagnostico",
    mede: "Usa a roda quente para localizar o freio que prende, e alerta sobre segurança",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1977" },
    falas: [
      "Quando eu freio, o carro puxa para a esquerda.",
      "Depois de rodar um pouco, a roda dianteira esquerda fica bem mais quente que a direita.",
      "Levantei a frente: a roda esquerda gira pesada mesmo sem pisar no freio. A direita gira solta.",
    ],
    esperado: {
      causa:
        "Freio dianteiro esquerdo prendendo: cilindro de roda travado, flexível retendo pressão ou sapatas desreguladas.",
      criterios: [
        "Interpreta a roda esquerda quente como freio daquele lado prendendo.",
        "Conclui pelo freio dianteiro esquerdo agarrando e lista as causas prováveis (cilindro, flexível, regulagem).",
        "Alerta explicitamente sobre o risco de rodar assim e recomenda profissional se o dono não tiver experiência com freio.",
        "Lembra de apoiar o carro com segurança ao levantá-lo.",
      ],
      naoDeve: ["Tratar como problema de alinhamento ou pneu depois da segunda fala."],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "cheiro-gasolina",
    titulo: "Cheiro forte de gasolina",
    categoria: "diagnostico",
    mede: "Coloca o risco de incêndio antes de qualquer diagnóstico",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1974", motor: "1500" },
    falas: [
      "Estou sentindo cheiro forte de gasolina, principalmente depois de desligar o carro.",
      "Abri a tampa do motor e a mangueira de borracha que vai até o carburador está rachada e úmida perto da bomba.",
    ],
    esperado: {
      causa: "Vazamento em mangueira de combustível ressecada no cofre do motor.",
      criterios: [
        "Alerta logo na primeira resposta para o risco de incêndio e para não ligar o carro até achar o vazamento.",
        "Recomenda trocar todas as mangueiras de combustível do cofre, não só o trecho rachado, com mangueira própria para combustível e abraçadeiras.",
      ],
      naoDeve: [
        "Liberar o uso do carro antes do reparo.",
        "Tratar o cheiro como algo normal do Fusca.",
      ],
      desfechosAceitos: ["suspeita", "confirmado", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "fuga-corrente",
    titulo: "Bateria descarrega com o carro parado",
    categoria: "diagnostico",
    mede: "Propõe medir antes de trocar peça e liga o sintoma a uma mudança recente",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1982", motor: "1600" },
    falas: [
      "Se eu deixo o carro parado dois ou três dias, a bateria descarrega. Andando, ela carrega normal.",
      "Instalei um rádio novo há um mês. Antes disso não acontecia.",
      "Pus uma lâmpada entre o polo negativo e o cabo: com tudo desligado ela acende fraquinha. Quando tiro o fio do rádio, apaga.",
    ],
    esperado: {
      causa:
        "Consumo parasita pelo rádio instalado ligado direto na bateria, sem passar pela chave.",
      criterios: [
        "Propõe um teste de consumo com tudo desligado (multímetro ou lâmpada) antes de trocar bateria ou gerador.",
        "Relaciona o início do problema à instalação do rádio.",
        "Conclui pelo rádio e sugere corrigir a ligação (alimentação pela chave ou relé).",
      ],
      naoDeve: ["Mandar trocar a bateria ou o gerador sem o teste de consumo."],
      desfechosAceitos: ["suspeita", "confirmado", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "partida-frio-alcool",
    titulo: "Motor a álcool não pega de manhã fria",
    categoria: "diagnostico",
    mede: "Usa a ficha (álcool) desde o início e isola a falha em sequência",
    veiculo: {
      modelo: "Fusca",
      ano: "1985",
      motor: "1600",
      carburacao: "Solex simples",
      combustivel: "álcool",
      ignicao: "platinado",
      sistema_eletrico: "12V",
    },
    falas: [
      "Nos dias frios de manhã meu Fusca não pega de jeito nenhum. Depois que o dia esquenta, pega normal.",
      "O tanquinho de gasolina da partida a frio está cheio. Quando dou partida não escuto a bombinha funcionando.",
      "O fusível dela está bom e chega energia no conector quando dou a partida.",
    ],
    esperado: {
      causa:
        "Bomba elétrica do sistema de partida a frio com defeito (recebe energia e não funciona).",
      criterios: [
        "Considera o sistema de partida a frio desde a primeira resposta, sem perguntar o combustível (está na ficha).",
        "Isola a falha em sequência: tanquinho, fusível, alimentação, bomba.",
        "Conclui pela bombinha depois de confirmada a energia no conector.",
      ],
      naoDeve: ["Perguntar se o carro é a álcool ou a gasolina."],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "media",
    duvida:
      "Confira se o Fusca 1600 a álcool de 1985 usava esse sistema (tanquinho com bombinha elétrica) do jeito descrito.",
    revisado: false,
  },
  {
    id: "historico-recorrencia",
    titulo: "Falha de marcha lenta que voltou depois da troca",
    categoria: "diagnostico",
    mede: "Usa o histórico: não repete a troca recente e busca causa a montante",
    veiculo: { ...FUSCA_1300_SOLEX, ano: "1979" },
    historico: [
      {
        tipo: "diagnostico",
        titulo: "Marcha lenta irregular",
        sistema: "ignicao",
        desfecho: "suspeita",
        diasAtras: 90,
      },
      {
        tipo: "diagnostico",
        titulo: "Falha em marcha lenta — suspeita no platinado",
        sistema: "ignicao",
        desfecho: "sem_retorno",
        diasAtras: 25,
      },
      {
        tipo: "servico",
        titulo: "Troca de platinado e condensador",
        sistema: "ignicao",
        diasAtras: 20,
      },
    ],
    falas: [
      "A falha na marcha lenta voltou. Ela fica irregular e às vezes quase morre.",
      "Balancei o eixo do distribuidor com a mão e ele tem folga, mexe pros lados.",
    ],
    esperado: {
      causa:
        "Eixo do distribuidor com folga (buchas gastas), que altera a abertura do platinado e explica a volta da falha.",
      criterios: [
        "Reconhece que platinado e condensador foram trocados há pouco e que o problema é recorrente.",
        "Procura causa a montante da peça já trocada, em vez de repetir a troca.",
        "Conclui pela folga no eixo do distribuidor após a segunda fala.",
      ],
      naoDeve: [
        "Recomendar trocar de novo o platinado ou o condensador como solução.",
        "Perguntar o que já está na ficha ou no histórico.",
      ],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "media",
    duvida:
      "Confira se a folga no eixo do distribuidor é mesmo a causa a montante mais comum para esse quadro, ou se você apontaria outra (entrada falsa de ar, por exemplo).",
    revisado: false,
  },
  {
    id: "ficha-ignicao-eletronica",
    titulo: "Falha em alta que piora com chuva — ignição eletrônica",
    categoria: "diagnostico",
    mede: "Respeita a ficha: não sugere platinado num carro com ignição eletrônica",
    veiculo: {
      modelo: "Fusca",
      ano: "1981",
      motor: "1600",
      carburacao: "Solex simples",
      combustivel: "gasolina",
      ignicao: "eletrônica",
      sistema_eletrico: "12V",
      modificacoes: "Ignição eletrônica instalada no lugar do platinado",
    },
    falas: [
      "Meu Fusca começou a falhar em rotação alta, na estrada. Em baixa anda bem.",
      "Notei que piora quando chove ou depois de lavar o motor.",
    ],
    esperado: {
      causa:
        "Fuga de alta tensão por umidade no secundário da ignição (cabos de vela, tampa do distribuidor ou rotor).",
      criterios: [
        "Não inclui platinado nem condensador entre as hipóteses.",
        "Liga a piora com umidade a fuga de alta tensão e foca em cabos, tampa e rotor.",
      ],
      naoDeve: ["Perguntar qual é o tipo de ignição.", "Sugerir regular ou trocar o platinado."],
      desfechosAceitos: ["suspeita", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "falseamento-tampa",
    titulo: "Falha ao acelerar — a favorita cai",
    categoria: "diagnostico",
    mede: "Descarta a hipótese favorita citando a evidência que a derrubou",
    veiculo: FUSCA_1300_SOLEX,
    falas: [
      "Meu Fusca falha quando acelero.",
      "Desmontei o carburador semana passada e testei: a bomba de aceleração esguicha forte. E a falha acontece até em velocidade constante na estrada, não só quando piso.",
      "Olhei a tampa do distribuidor por dentro e tem uma trinca fina com um risco escuro.",
    ],
    esperado: {
      causa: "Tampa do distribuidor trincada, com fuga de centelha pela trinca.",
      criterios: [
        "Marca a bomba de aceleração como descartada citando o esguicho forte e a falha em velocidade constante.",
        "Muda o foco para a ignição depois da segunda fala.",
        "Conclui pela tampa trincada e sugere trocá-la, conferindo também rotor e cabos.",
      ],
      naoDeve: ["Continuar defendendo problema de carburação depois da segunda fala."],
      desfechosAceitos: ["suspeita", "confirmado", "sem_retorno"],
    },
    confianca: "alta",
    revisado: false,
  },

  // -------------------------------------------------------------------- triagem
  {
    id: "especificacao-ponto",
    titulo: "Pergunta de especificação: ponto de ignição",
    categoria: "especificacao",
    mede: "Triagem (sem hipóteses) e recusa a inventar número",
    veiculo: {
      modelo: "Fusca",
      ano: "1984",
      motor: "1600",
      carburacao: "Solex simples",
      combustivel: "álcool",
      ignicao: "platinado",
      sistema_eletrico: "12V",
    },
    falas: ["Qual é o ponto de ignição do meu motor?"],
    esperado: {
      criterios: [
        "Não levanta hipóteses nem chama o painel de raciocínio.",
        "Se der valor, apresenta-o como referência, diz de que depende (motor, combustível, distribuidor) e manda conferir no manual ou na especificação do motor.",
        "Explica como verificar o ponto (lâmpada de ponto e marca na polia).",
        "Usa a ficha (1600 a álcool) sem perguntar o motor.",
      ],
      naoDeve: [
        "Afirmar um único valor como certo sem fonte nem ressalva.",
        "Perguntar o motor ou o combustível.",
      ],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "procedimento-valvulas",
    titulo: "Pergunta de procedimento: regular as válvulas",
    categoria: "procedimento",
    mede: "Triagem: vai direto ao passo a passo, sem hipóteses",
    veiculo: FUSCA_1300_SOLEX,
    falas: ["Como eu faço para regular as válvulas do meu Fusca? Já tenho o calibre de lâminas."],
    esperado: {
      criterios: [
        "Não levanta hipóteses nem chama o painel de raciocínio.",
        "Dá passo a passo numerado: motor frio, cada cilindro no ponto morto superior de compressão, medir e ajustar, conferir.",
        "Lembra de trocar as juntas das tampas de válvulas.",
        "Não afirma o valor de folga sem mandar conferir a especificação do motor.",
      ],
      naoDeve: [
        "Começar com perguntas de diagnóstico.",
        "Afirmar um único valor de folga como certo.",
      ],
    },
    confianca: "alta",
    revisado: false,
  },
  {
    id: "conversa-historia",
    titulo: "Conversa solta",
    categoria: "conversa",
    mede: "Triagem: responde breve, sem ferramentas, e volta ao universo do Fusca",
    veiculo: null,
    falas: ["Você sabe por que o Fusca ficou tão popular no Brasil?"],
    esperado: {
      criterios: [
        "Responde de forma breve e simpática.",
        "Não chama o painel de raciocínio nem registra evento.",
        "Termina oferecendo ajuda com o carro do dono.",
      ],
      naoDeve: ["Levantar hipóteses de diagnóstico."],
    },
    confianca: "alta",
    revisado: false,
  },
];
