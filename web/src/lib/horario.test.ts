import { describe, expect, it } from "vitest";
import { generarFranjas, minutosAFormato, minutosDe, normalizarHora, turnoCubreFranja } from "./horario";

describe("minutosDe / normalizarHora", () => {
  it("convierte HH:MM a minutos desde medianoche", () => {
    expect(minutosDe("00:00")).toBe(0);
    expect(minutosDe("06:00")).toBe(360);
    expect(minutosDe("14:00")).toBe(840);
    expect(minutosDe("23:59")).toBe(1439);
  });

  it("rechaza horas no válidas", () => {
    expect(minutosDe("25:00")).toBeNull();
    expect(minutosDe("6:60")).toBeNull();
    expect(minutosDe("")).toBeNull();
    expect(minutosDe("hola")).toBeNull();
    expect(minutosDe(undefined as unknown as string)).toBeNull();
  });

  it("normaliza con cero a la izquierda", () => {
    expect(normalizarHora("6:05")).toBe("06:05");
    expect(normalizarHora("22:00")).toBe("22:00");
    expect(normalizarHora("xx:00")).toBeNull();
  });
});

describe("generarFranjas", () => {
  it("genera franjas de 30 min entre las horas dadas (ejemplo 06:00–22:00)", () => {
    const f = generarFranjas("06:00", "22:00");
    expect(f).toHaveLength(32);
    expect(f[0]).toEqual({ desde: "06:00", hasta: "06:30" });
    expect(f[1]).toEqual({ desde: "06:30", hasta: "07:00" });
    expect(f[31]).toEqual({ desde: "21:30", hasta: "22:00" });
  });

  it("la última franja termina exactamente en la hora de fin", () => {
    const f = generarFranjas("06:00", "08:00");
    expect(f).toHaveLength(4);
    expect(f[f.length - 1]).toEqual({ desde: "07:30", hasta: "08:00" });
  });

  it("acepta una duración configurable (01:00, 00:15…) y la aplica a cada franja", () => {
    const h = generarFranjas("06:00", "22:00", 60);
    expect(h).toHaveLength(16);
    expect(h[0]).toEqual({ desde: "06:00", hasta: "07:00" });
    expect(h[15]).toEqual({ desde: "21:00", hasta: "22:00" });
    const q = generarFranjas("06:00", "08:00", 15);
    expect(q).toHaveLength(8);
    expect(q[7]).toEqual({ desde: "07:45", hasta: "08:00" });
  });

  it("devuelve vacío si el rango o la duración no son válidos", () => {
    expect(generarFranjas("22:00", "22:00")).toEqual([]);
    expect(generarFranjas("22:00", "06:00")).toEqual([]);
    expect(generarFranjas("", "06:00")).toEqual([]);
    expect(generarFranjas("06:00", "25:00")).toEqual([]);
    expect(generarFranjas("06:00", "08:00", 0)).toEqual([]);
    expect(generarFranjas("06:00", "08:00", -10)).toEqual([]);
  });

  it("minutosAFormato escribe la duración en HH:MM", () => {
    expect(minutosAFormato(30)).toBe("00:30");
    expect(minutosAFormato(90)).toBe("01:30");
    expect(minutosAFormato(420)).toBe("07:00");
  });
});

describe("turnoCubreFranja", () => {
  const slot = (desde: string, hasta: string) => ({ desde, hasta });

  it("cubre las franjas dentro del rango del turno (inicio incluido, fin excluido)", () => {
    expect(turnoCubreFranja("06:00", "14:00", slot("06:00", "06:30"))).toBe(true);
    expect(turnoCubreFranja("06:00", "14:00", slot("13:30", "14:00"))).toBe(true);
    expect(turnoCubreFranja("06:00", "14:00", slot("14:00", "14:30"))).toBe(false);
    expect(turnoCubreFranja("06:00", "14:00", slot("05:30", "06:00"))).toBe(false);
  });

  it("no cubre nada si el turno no tiene horario o es nocturno/invertido", () => {
    expect(turnoCubreFranja(undefined, undefined, slot("06:00", "06:30"))).toBe(false);
    expect(turnoCubreFranja("22:00", "06:00", slot("06:00", "06:30"))).toBe(false);
  });
});
