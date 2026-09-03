import { describe, expect, it } from "vitest";
import {
  addDays,
  compare,
  diasQuincena,
  fmt,
  indiceQuincena,
  inicioDeIndice,
  inicioQuincena,
  inicioSemana,
  nombreDia,
  parseFechaES,
  toISO,
  transcurrido,
  transcurridoTexto
} from "./dates";

describe("fechas básicas", () => {
  it("formatea ISO a dd/mm/aaaa", () => {
    expect(fmt("2026-09-07")).toBe("07/09/2026");
    expect(fmt("2026-12-01")).toBe("01/12/2026");
  });

  it("suma días sin huso horario", () => {
    expect(addDays("2026-09-07", 1)).toBe("2026-09-08");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("compara fechas", () => {
    expect(compare("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compare("2026-02-01", "2026-01-01")).toBe(1);
    expect(compare("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("nombre del día en español", () => {
    expect(nombreDia("2026-09-07")).toBe("lunes");
    expect(nombreDia("2026-09-13")).toBe("domingo");
    expect(nombreDia("2026-09-19")).toBe("sábado");
  });

  it("toISO redondea a fecha local", () => {
    const d = new Date(2026, 8, 7, 12, 0, 0);
    expect(toISO(d)).toBe("2026-09-07");
  });
});

describe("parseFechaES (dd/mm/aaaa)", () => {
  it("convierte dd/mm/aaaa a ISO", () => {
    expect(parseFechaES("14/03/1985")).toBe("1985-03-14");
    expect(parseFechaES("05/09/2026")).toBe("2026-09-05");
    expect(parseFechaES("31/12/2026")).toBe("2026-12-31");
  });

  it("admite dígitos sin cero inicial", () => {
    expect(parseFechaES("1/11/2026")).toBe("2026-11-01");
    expect(parseFechaES("9/3/2026")).toBe("2026-03-09");
  });

  it("valida días reales (bisiestos incluidos)", () => {
    expect(parseFechaES("29/02/2028")).toBe("2028-02-29");
    expect(parseFechaES("29/02/2026")).toBeNull();
    expect(parseFechaES("31/04/2026")).toBeNull();
  });

  it("rechaza mes/día (mm/dd), meses o días fuera de rango y vacíos", () => {
    expect(parseFechaES("03/14/2026")).toBeNull(); // formato mm/dd → mes 14
    expect(parseFechaES("32/05/2026")).toBeNull(); // día fuera de rango
    expect(parseFechaES("00/05/2026")).toBeNull();
    expect(parseFechaES("")).toBeNull();
    expect(parseFechaES("14-03-1985")).toBeNull();
  });
});

describe("quincenas alineadas con semanas ISO", () => {
  it("el lunes 2026-09-07 es inicio de quincena", () => {
    expect(indiceQuincena("2026-09-07")).toBe(174);
    expect(inicioDeIndice(174)).toBe("2026-09-07");
    expect(inicioQuincena("2026-09-07")).toBe("2026-09-07");
  });

  it("cualquier día de la quincena devuelve su lunes", () => {
    expect(inicioQuincena("2026-09-13")).toBe("2026-09-07");
    expect(inicioQuincena("2026-09-20")).toBe("2026-09-07");
    expect(inicioQuincena("2026-09-21")).toBe("2026-09-21");
  });

  it("genera 14 días consecutivos", () => {
    const dias = diasQuincena("2026-09-07");
    expect(dias).toHaveLength(14);
    expect(dias[0]).toBe("2026-09-07");
    expect(dias[6]).toBe("2026-09-13");
    expect(dias[7]).toBe("2026-09-14");
    expect(dias[13]).toBe("2026-09-20");
  });

  it("la quincena anterior retrocede 14 días", () => {
    const actual = inicioQuincena("2026-09-07");
    expect(addDays(actual, -14)).toBe("2026-08-24");
    expect(inicioQuincena(addDays("2026-09-07", -14))).toBe("2026-08-24");
  });

  it("cruza años correctamente", () => {
    // 2026-12-28 es lunes; +14 cruza a 2027-01-11
    expect(inicioQuincena("2026-12-28")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 14)).toBe("2027-01-11");
  });

  it("inicioSemana devuelve el lunes ISO", () => {
    expect(inicioSemana("2026-09-07")).toBe("2026-09-07"); // lunes
    expect(inicioSemana("2026-09-13")).toBe("2026-09-07"); // domingo
    expect(inicioSemana("2026-09-16")).toBe("2026-09-14"); // miércoles
  });
});

describe("antigüedad (años, meses y días)", () => {
  it("descompone un intervalo simple", () => {
    expect(transcurrido("2024-06-01", "2024-09-03")).toEqual({ anios: 0, meses: 3, dias: 2 });
    expect(transcurrido("2020-01-06", "2026-09-03")).toEqual({ anios: 6, meses: 7, dias: 28 });
  });

  it("pide días prestados al mes anterior", () => {
    expect(transcurrido("2021-01-31", "2021-03-01")).toEqual({ anios: 0, meses: 1, dias: 1 });
    expect(transcurrido("2024-01-31", "2024-03-01")).toEqual({ anios: 0, meses: 1, dias: 1 });
  });

  it("respeta los años bisiestos", () => {
    expect(transcurrido("2023-02-28", "2024-02-28")).toEqual({ anios: 1, meses: 0, dias: 0 });
    expect(transcurrido("2024-02-29", "2025-02-28")).toEqual({ anios: 1, meses: 0, dias: 0 });
  });

  it("texto en formato «años, meses, días»", () => {
    expect(transcurridoTexto("2026-06-01", "2026-09-06")).toBe("0 años, 3 meses, 5 días");
    expect(transcurridoTexto("2024-02-01", "2025-03-02")).toBe("1 año, 1 mes, 1 día");
  });

  it("devuelve — cuando el intervalo no es válido", () => {
    expect(transcurrido("2026-09-03", "2024-01-01")).toBeNull();
    expect(transcurridoTexto("2026-09-03", "2024-01-01")).toBe("—");
  });
});
