import { describe, expect, it } from "vitest";
import { descripcionSaldo, formatearTiempo, parsearTiempo } from "./tiempo";

describe("tiempo recuperable: parseo", () => {
  it("acepta formatos con y sin signo", () => {
    expect(parsearTiempo("+2:30")).toBe(150);
    expect(parsearTiempo("-1:00")).toBe(-60);
    expect(parsearTiempo("2:30")).toBe(150);
    expect(parsearTiempo("0:45")).toBe(45);
    expect(parsearTiempo("  -0:05 ")).toBe(-5);
  });

  it("acepta horas grandes y minutos de dos dígitos", () => {
    expect(parsearTiempo("+12:00")).toBe(720);
    expect(parsearTiempo("+10:05")).toBe(605);
    expect(parsearTiempo("-3:59")).toBe(-239);
  });

  it("rechaza valores no válidos", () => {
    expect(parsearTiempo("")).toBeNull();
    expect(parsearTiempo("abc")).toBeNull();
    expect(parsearTiempo("2:99")).toBeNull();
    expect(parsearTiempo("2:5")).toBeNull();
    expect(parsearTiempo("2.30")).toBeNull();
    expect(parsearTiempo("+")).toBeNull();
    expect(parsearTiempo("+-1:00")).toBeNull();
    expect(parsearTiempo("2:3:30")).toBeNull();
  });
});

describe("tiempo recuperable: formateo", () => {
  it("aplica signo y rellena minutos", () => {
    expect(formatearTiempo(150)).toBe("+2:30");
    expect(formatearTiempo(-60)).toBe("-1:00");
    expect(formatearTiempo(605)).toBe("+10:05");
    expect(formatearTiempo(-239)).toBe("-3:59");
  });

  it("el cero se muestra sin signo", () => {
    expect(formatearTiempo(0)).toBe("0:00");
  });

  it("redondea hacia abajo las horas", () => {
    expect(formatearTiempo(5)).toBe("+0:05");
    expect(formatearTiempo(-5)).toBe("-0:05");
  });
});

describe("tiempo recuperable: descripción del saldo", () => {
  it("describe el significado del signo", () => {
    expect(descripcionSaldo(-30)).toContain("extra");
    expect(descripcionSaldo(30).toLowerCase()).toContain("debe");
    expect(descripcionSaldo(0)).toContain("cero");
  });
});
