import { describe, expect, it } from "vitest";
import { construirPdfCalendario, type FilaPdf } from "./pdf";

function fila(nombre: string, color: string, turnos: ("M" | "T" | "—" | null)[]): FilaPdf {
  return {
    nombre,
    color,
    celdas: turnos.map((t) => {
      if (t === "M" || t === "T") return { turno: t, clase: "turno" };
      if (t === "—") return { turno: null, clase: "descanso" };
      return { turno: null, clase: "vacio" };
    })
  };
}

const M7 = ["M", "M", "M", "M", "M", "M", "M"] as const;
const T7 = ["T", "T", "T", "T", "T", "T", "T"] as const;

describe("PDF calendario", () => {
  it("genera un PDF de una quincena sin errores", () => {
    const filas: FilaPdf[] = [
      fila("María García", "#E91E63", [...M7, ...T7] as unknown as ("M" | "T" | "—" | null)[]),
      fila("Lucía Fernández", "#3F51B5", [...M7, ...M7] as unknown as ("M" | "T" | "—" | null)[]),
      fila("Carmen Martínez", "#00897B", [...T7, ...M7] as unknown as ("M" | "T" | "—" | null)[])
    ];
    const doc = construirPdfCalendario({
      inicio: "2026-09-07",
      filas,
      titulo: "Calendario de turnos"
    });
    expect(doc.getNumberOfPages()).toBe(1);
    const out = doc.output("arraybuffer");
    expect(out.byteLength).toBeGreaterThan(1000);
    // cabecera %PDF
    const head = new TextDecoder().decode(out.slice(0, 8));
    expect(head).toContain("%PDF");
  });

  it("marca las celdas fijadas a mano con borde según su origen", () => {
    const manual: FilaPdf = {
      nombre: "Sofía Jiménez",
      color: "#F4511E",
      celdas: [
        { turno: "M", clase: "turno", origen: "empresa" },
        { turno: null, clase: "descanso" },
        { turno: "T", clase: "turno", origen: "intercambio" },
        { turno: "M", clase: "turno" },
        ...Array.from({ length: 10 }, () => ({ turno: null as "M" | "T" | null, clase: "vacio" as const }))
      ]
    };
    const doc = construirPdfCalendario({ inicio: "2026-09-07", filas: [manual] });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("dibuja ausencias y días cerrados con rayado sin errores", () => {
    const filas: FilaPdf[] = [
      {
        nombre: "Ana Ruiz",
        color: "#26A69A",
        celdas: [
          { turno: null, clase: "ausencia", sigla: "V" },
          { turno: null, clase: "ausencia", sigla: "B" },
          { turno: null, clase: "cerrado" },
          { turno: "M", clase: "turno" },
          ...Array.from({ length: 10 }, () => ({ turno: null as "M" | "T" | null, clase: "vacio" as const }))
        ]
      }
    ];
    const doc = construirPdfCalendario({ inicio: "2026-09-07", filas });
    expect(doc.getNumberOfPages()).toBe(1);
    const out = doc.output("arraybuffer");
    expect(out.byteLength).toBeGreaterThan(1000);
  });
});
