import { describe, expect, it } from "vitest";
import { construirPdfCalendario, construirPdfPlanHoras, type FilaPdf } from "./pdf";

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

  it("acepta celdas con varios turnos y símbolos (descanso/cerrado) sin errores", () => {
    const manual: FilaPdf = {
      nombre: "Sofía Jiménez",
      color: "#F4511E",
      celdas: [
        { turno: "M", clase: "turno", turnosDia: [{ turno: "M", desde: "06:00", hasta: "14:00" }] },
        { turno: null, clase: "descanso" },
        { turno: "T", clase: "turno", turnosDia: [{ turno: "T", desde: "14:00", hasta: "22:00" }] },
        { turno: "M", clase: "turno" },
        ...Array.from({ length: 10 }, () => ({ turno: null as "M" | "T" | null, clase: "vacio" as const }))
      ]
    };
    const doc = construirPdfCalendario({ inicio: "2026-09-07", filas: [manual] });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("genera el PDF del plan por horas (vista avanzada) sin errores", () => {
    const franjas = [
      { desde: "06:00", hasta: "06:30" },
      { desde: "06:30", hasta: "07:00" },
      { desde: "07:00", hasta: "07:30" },
      { desde: "07:30", hasta: "08:00" }
    ];
    const empAna = { nombre: "Ana Ruiz", color: "#26A69A", desde: "06:00", hasta: "07:30" };
    const empLuis = { nombre: "Luis Pérez", color: "#7E57C2", desde: "06:30", hasta: "08:00" };
    // Cuatro franjas × 14 días: día 1 cerrado, resto con 1-2 empleados.
    const celdas = franjas.map((fr, f) =>
      Array.from({ length: 14 }, (_, i) => {
        if (i === 0) return { cerrado: true, empleados: [] };
        const empleados = [];
        if (f < 3) empleados.push(empAna);
        if (f >= 1) empleados.push(empLuis);
        return { cerrado: false, empleados };
      }));
    const doc = construirPdfPlanHoras({
      inicio: "2026-09-07",
      dias: Array.from({ length: 14 }, (_, i) => `2026-09-${String(7 + i).padStart(2, "0")}`),
      franjas,
      celdas,
      duracionFranjaMin: 30
    });
    expect(doc.getNumberOfPages()).toBe(1);
    const out = doc.output("arraybuffer");
    expect(out.byteLength).toBeGreaterThan(1000);
    const head = new TextDecoder().decode(out.slice(0, 8));
    expect(head).toContain("%PDF");
  });

  it("leyenda en varias líneas y horas en celdas con muchos turnos", () => {
    // 10 turnos personalizados con horario: la leyenda no cabe en una línea.
    const turnos = Array.from({ length: 10 }, (_, i) => ({
      sigla: `T${i + 1}`,
      nombre: `Turno ${i + 1}`,
      color: "#90A4AE",
      desde: `${String(6 + i).padStart(2, "0")}:00`,
      hasta: `${String(14 + i).padStart(2, "0")}:00`
    }));
    const filas: FilaPdf[] = [
      fila("María García", "#E91E63", [...M7, ...T7] as unknown as ("M" | "T" | "—" | null)[]),
      fila("Lucía Fernández", "#3F51B5", [...M7, ...M7] as unknown as ("M" | "T" | "—" | null)[])
    ];
    const doc = construirPdfCalendario({
      inicio: "2026-09-07",
      filas,
      turnos
    });
    expect(doc.getNumberOfPages()).toBe(1);
    const out = doc.output("arraybuffer");
    expect(out.byteLength).toBeGreaterThan(1000);
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
