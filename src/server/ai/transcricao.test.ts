import { describe, expect, it } from "vitest";

import { decodificarDataUrl, urlDeAudioPermitida } from "./transcricao";

const SUPABASE = "https://projeto.supabase.co";

describe("urlDeAudioPermitida — o servidor só baixa o que é do próprio app", () => {
  it("aceita áudio embutido (data URL) e áudio do bucket de anexos do projeto", () => {
    expect(urlDeAudioPermitida("data:audio/webm;base64,AAAA", SUPABASE)).toBe(true);
    expect(
      urlDeAudioPermitida(`${SUPABASE}/storage/v1/object/public/anexos/uid/a.webm`, SUPABASE),
    ).toBe(true);
  });

  it("recusa qualquer outro destino — é a brecha de SSRF fechada neste ponto", () => {
    expect(urlDeAudioPermitida("https://exemplo.com/a.webm", SUPABASE)).toBe(false);
    expect(urlDeAudioPermitida("http://169.254.169.254/latest/meta-data", SUPABASE)).toBe(false);
    expect(
      urlDeAudioPermitida(`${SUPABASE}/storage/v1/object/public/outro-bucket/a.webm`, SUPABASE),
    ).toBe(false);
    expect(
      urlDeAudioPermitida(`${SUPABASE}.atacante.com/storage/v1/object/public/anexos/a`, SUPABASE),
    ).toBe(false);
    expect(
      urlDeAudioPermitida(`${SUPABASE}/storage/v1/object/public/anexos/../segredo`, SUPABASE),
    ).toBe(false);
  });

  it("recusa data URL que não é áudio", () => {
    expect(urlDeAudioPermitida("data:image/png;base64,AAAA", SUPABASE)).toBe(false);
  });
});

describe("decodificarDataUrl", () => {
  it("extrai o tipo e os bytes", () => {
    const { mediaType, bytes } = decodificarDataUrl("data:audio/webm;codecs=opus;base64,AQID");
    expect(mediaType).toBe("audio/webm");
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("recusa o que não é data URL em base64", () => {
    expect(() => decodificarDataUrl("data:audio/webm,texto-cru")).toThrow();
  });
});
