import { describe, expect, it } from "vitest";

import {
  EVENTOS_RECENTES,
  MAX_EVENTOS_CONTEXTO,
  MAX_TITULO_LENGTH,
  buildHistoryContext,
  findRecurrences,
  formatEventLine,
  normalizeTitulo,
  selectEventsForContext,
  type VehicleEvent,
} from "./events";

const DIA = 24 * 60 * 60 * 1000;
const BASE = Date.UTC(2026, 6, 25, 12);

function evento(overrides: Partial<VehicleEvent> = {}): VehicleEvent {
  return {
    id: crypto.randomUUID(),
    tipo: "diagnostico",
    titulo: "Problema na bobina",
    sistema: "eletrica",
    data: BASE,
    origem: "agente",
    criadoEm: BASE,
    ...overrides,
  };
}

describe("normalizeTitulo", () => {
  it("colapsa espaços", () => {
    expect(normalizeTitulo("  troca   das  velas ")).toBe("troca das velas");
  });

  it("trunca título longo com reticências", () => {
    const resultado = normalizeTitulo("a".repeat(200));
    expect(resultado).toHaveLength(MAX_TITULO_LENGTH);
    expect(resultado.endsWith("…")).toBe(true);
  });

  it("não mexe em título que já cabe", () => {
    expect(normalizeTitulo("Troca das 4 velas")).toBe("Troca das 4 velas");
  });
});

describe("formatEventLine", () => {
  it("rende uma linha curta com data e título", () => {
    const linha = formatEventLine(evento({ titulo: "Troca das 4 velas", desfecho: undefined }));
    expect(linha).toBe("25/07/2026 · Troca das 4 velas");
  });

  it("marca desfecho desconhecido, que é o caso comum", () => {
    const linha = formatEventLine(evento({ desfecho: "sem_retorno" }));
    expect(linha).toBe("25/07/2026 · Problema na bobina — sem confirmação de que foi resolvido");
  });

  it("marca confirmação", () => {
    const linha = formatEventLine(evento({ desfecho: "confirmado" }));
    expect(linha).toContain("confirmado que era o problema");
  });

  it("preserva o descarte, que também é informação", () => {
    const linha = formatEventLine(evento({ desfecho: "descartado" }));
    expect(linha).toContain("descartado");
  });

  it("inclui quilometragem quando houver", () => {
    const linha = formatEventLine(evento({ titulo: "Troca de óleo", km: 145000 }));
    expect(linha).toContain("(145.000 km)");
  });
});

describe("selectEventsForContext", () => {
  it("mantém os mais recentes primeiro", () => {
    const eventos = [
      evento({ titulo: "antigo", data: BASE - 10 * DIA }),
      evento({ titulo: "novo", data: BASE }),
    ];
    const [primeiro] = selectEventsForContext(eventos);
    expect(primeiro.titulo).toBe("novo");
  });

  it("limita aos recentes quando não há sistema em foco", () => {
    const eventos = Array.from({ length: 30 }, (_, i) =>
      evento({ titulo: `e${i}`, data: BASE - i * DIA }),
    );
    expect(selectEventsForContext(eventos)).toHaveLength(EVENTOS_RECENTES);
  });

  it("traz evento antigo do sistema em foco, fora da janela recente", () => {
    const eventos = [
      ...Array.from({ length: 15 }, (_, i) =>
        evento({ titulo: `motor ${i}`, sistema: "motor", data: BASE - i * DIA }),
      ),
      evento({ titulo: "bobina antiga", sistema: "eletrica", data: BASE - 300 * DIA }),
    ];

    const selecionados = selectEventsForContext(eventos, "eletrica");

    expect(selecionados.map((e) => e.titulo)).toContain("bobina antiga");
  });

  it("respeita o teto absoluto de eventos", () => {
    const eventos = Array.from({ length: 100 }, (_, i) =>
      evento({ titulo: `e${i}`, sistema: "motor", data: BASE - i * DIA }),
    );
    expect(selectEventsForContext(eventos, "motor").length).toBeLessThanOrEqual(
      MAX_EVENTOS_CONTEXTO,
    );
  });

  it("não muta a lista original", () => {
    const eventos = [
      evento({ titulo: "a", data: BASE - DIA }),
      evento({ titulo: "b", data: BASE }),
    ];
    selectEventsForContext(eventos);
    expect(eventos[0].titulo).toBe("a");
  });
});

describe("findRecurrences", () => {
  it("encontra episódios anteriores no mesmo sistema", () => {
    const eventos = [
      evento({ sistema: "eletrica", data: BASE }),
      evento({ sistema: "eletrica", data: BASE - 60 * DIA }),
      evento({ sistema: "motor", data: BASE - 30 * DIA }),
    ];
    expect(findRecurrences(eventos, "eletrica")).toHaveLength(2);
  });

  it("ignora serviços, que não são episódios de problema", () => {
    const eventos = [
      evento({ sistema: "eletrica", tipo: "servico", titulo: "Troca das velas" }),
      evento({ sistema: "eletrica", tipo: "diagnostico" }),
    ];
    expect(findRecurrences(eventos, "eletrica")).toHaveLength(1);
  });
});

describe("buildHistoryContext", () => {
  it("retorna null quando não há histórico", () => {
    expect(buildHistoryContext([])).toBeNull();
  });

  it("monta bloco com uma linha por evento", () => {
    const contexto = buildHistoryContext([
      evento({ titulo: "Troca das 4 velas", tipo: "servico", desfecho: undefined }),
    ]);
    expect(contexto).toContain("Histórico deste carro");
    expect(contexto).toContain("- 25/07/2026 · Troca das 4 velas");
  });

  it("alerta sobre recorrência a partir de dois episódios", () => {
    const eventos = [
      evento({ sistema: "eletrica", data: BASE }),
      evento({ sistema: "eletrica", data: BASE - 90 * DIA }),
    ];
    const contexto = buildHistoryContext(eventos, "eletrica");
    expect(contexto).toContain("ATENÇÃO");
    expect(contexto).toContain("2 episódios");
  });

  it("não alerta com um episódio só", () => {
    const contexto = buildHistoryContext([evento({ sistema: "eletrica" })], "eletrica");
    expect(contexto).not.toContain("ATENÇÃO");
  });
});
