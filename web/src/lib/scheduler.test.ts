import { describe, expect, it } from "vitest";
import type { Ausencia, Empleado } from "./types";
import { plantillaEmpleado } from "./types";
import { planificar } from "./scheduler";
import { addDays } from "./dates";

// Quincena de prueba: lunes 2026-09-07 → domingo 2026-09-20.
const INICIO = "2026-09-07";

function empleado(parcial: Partial<Empleado> & { id: number; nombre: string }): Empleado {
  return plantillaEmpleado({ alta: "2020-01-06", ...parcial });
}

const POR_DEFECTO: Empleado[] = [
  empleado({ id: 1, nombre: "María", apellidos: "García", color: "#E91E63" }),
  empleado({ id: 2, nombre: "Lucía", apellidos: "Fernández", color: "#3F51B5" }),
  empleado({ id: 3, nombre: "Carmen", apellidos: "Martínez", color: "#00897B" }),
  empleado({ id: 4, nombre: "Sofía", apellidos: "Jiménez", color: "#F4511E" }),
  empleado({ id: 5, nombre: "Andrea", apellidos: "Moreno", color: "#7B1FA2" })
];

function plan(overrides: Partial<Parameters<typeof planificar>[0]> = {}) {
  return planificar({ inicio: INICIO, empleados: POR_DEFECTO, ausencias: [], ...overrides });
}

function asignacionesDe(result: ReturnType<typeof planificar>, fecha: string) {
  return result.auto.filter((a) => a.fecha === fecha);
}

describe("planificador: todo el personal queda asignado", () => {
  it("asigna todas las empleadas cada día", () => {
    const r = plan();
    for (let i = 0; i < 14; i++) {
      const fecha = addDays(INICIO, i);
      const ids = asignacionesDe(r, fecha).map((a) => a.empleadoId).sort();
      expect(ids).toEqual([1, 2, 3, 4, 5]);
    }
    expect(r.huecos).toHaveLength(0);
    expect(r.auto).toHaveLength(14 * 5);
  });

  it("ninguna empleada trabaja dos turnos el mismo día", () => {
    const r = plan();
    for (let i = 0; i < 14; i++) {
      const porEmp = new Map<number, number>();
      for (const a of asignacionesDe(r, addDays(INICIO, i))) {
        porEmp.set(a.empleadoId, (porEmp.get(a.empleadoId) ?? 0) + 1);
      }
      for (const n of porEmp.values()) expect(n).toBe(1);
    }
  });

  it("ambos turnos quedan cubiertos cada día", () => {
    const r = plan();
    for (let i = 0; i < 14; i++) {
      const fecha = addDays(INICIO, i);
      const turnos = asignacionesDe(r, fecha).map((a) => a.turno);
      expect(turnos).toContain("M");
      expect(turnos).toContain("T");
    }
  });
});

describe("planificador: alternancia semanal", () => {
  it("una empleada alterna M una semana y T la siguiente", () => {
    const r = plan();
    const mariaSem1 = r.auto.filter((a) => a.empleadoId === 1 && a.fecha < "2026-09-14");
    const mariaSem2 = r.auto.filter((a) => a.empleadoId === 1 && a.fecha >= "2026-09-14");
    expect(new Set(mariaSem1.map((a) => a.turno))).toEqual(new Set(["M"]));
    expect(new Set(mariaSem2.map((a) => a.turno))).toEqual(new Set(["T"]));
  });

  it("todo el equipo mantiene su turno semanal y lo invierte la semana siguiente", () => {
    const r = plan();
    for (const emp of POR_DEFECTO) {
      const sem1 = r.auto.filter((a) => a.empleadoId === emp.id && a.fecha < "2026-09-14");
      const sem2 = r.auto.filter((a) => a.empleadoId === emp.id && a.fecha >= "2026-09-14");
      const t1 = sem1.map((a) => a.turno);
      const t2 = sem2.map((a) => a.turno);
      expect(new Set(t1).size).toBe(1); // semana uniforme
      expect(new Set(t2).size).toBe(1);
      expect(t2[0]).not.toBe(t1[0]);
    }
  });

  it("el turno dominante de la semana anterior invierte la siguiente", () => {
    const previa = new Map<number, "M" | "T">([[1, "M"], [3, "T"], [4, "M"]]);
    const r = plan({ previa });
    // Carmen venía de tarde → la primera semana le toca mañana (invierte T→M)
    const carmenSem1 = r.auto.filter((a) => a.empleadoId === 3 && a.fecha < "2026-09-14");
    expect(new Set(carmenSem1.map((a) => a.turno))).toEqual(new Set(["M"]));
    // y la segunda semana, tarde
    const carmenSem2 = r.auto.filter((a) => a.empleadoId === 3 && a.fecha >= "2026-09-14");
    expect(new Set(carmenSem2.map((a) => a.turno))).toEqual(new Set(["T"]));
    // María venía de mañana → le toca tarde la primera semana
    const mariaSem1 = r.auto.filter((a) => a.empleadoId === 1 && a.fecha < "2026-09-14");
    expect(new Set(mariaSem1.map((a) => a.turno))).toEqual(new Set(["T"]));
  });
});

describe("planificador: ausencias y descansos", () => {
  it("la empleada de vacaciones no se asigna esos días", () => {
    const ausencias: Ausencia[] = [
      { id: 1, empleadoId: 1, inicio: "2026-09-08", fin: "2026-09-10", tipo: "vacaciones" }
    ];
    const r = plan({ ausencias });
    for (let i = 0; i < 14; i++) {
      const fecha = addDays(INICIO, i);
      const tiene = asignacionesDe(r, fecha).some((a) => a.empleadoId === 1);
      if (fecha >= "2026-09-08" && fecha <= "2026-09-10") {
        expect(tiene).toBe(false);
      } else {
        expect(tiene).toBe(true);
      }
    }
  });

  it("respeta los descansos fijados a mano", () => {
    const r = plan({ descansos: new Set(["2|2026-09-09"]) });
    expect(asignacionesDe(r, "2026-09-09").some((a) => a.empleadoId === 2)).toBe(false);
    expect(asignacionesDe(r, "2026-09-10").some((a) => a.empleadoId === 2)).toBe(true);
  });
});

describe("planificador: manuales y celdas vacías", () => {
  it("conserva las asignaciones manuales y no duplica a la empleada", () => {
    const manuales = [
      { fecha: "2026-09-08", turno: "M" as const, empleadoId: 3, origen: "manual" as const }
    ];
    const r = plan({ manuales });
    const delDia = r.auto.filter((a) => a.fecha === "2026-09-08" && a.empleadoId === 3);
    expect(delDia).toHaveLength(0); // la manual no se repite en auto
    // el resto del día sigue cubierto: 5 empleadas → manual 3 + 4 auto
    const totalDia = r.auto.filter((a) => a.fecha === "2026-09-08").length + 1;
    expect(totalDia).toBe(5);
  });

  it("no genera huecos en turnos cerrados deliberadamente", () => {
    const vacias = new Set(["2026-09-09|M"]);
    const r = plan({ vacias });
    expect(r.huecos.filter((h) => h.fecha === "2026-09-09" && h.turno === "M")).toHaveLength(0);
  });
});

describe("planificador: equilibrio y cobertura", () => {
  it("reparte a todo el equipo aunque sobren empleadas para un turno", () => {
    const equipo = [
      empleado({ id: 1, nombre: "María" }),
      empleado({ id: 2, nombre: "Lucía" }),
      empleado({ id: 3, nombre: "Carmen" }),
      empleado({ id: 4, nombre: "Sofía" }),
      empleado({ id: 5, nombre: "Paula" }),
      empleado({ id: 6, nombre: "Nuria" }),
      empleado({ id: 7, nombre: "Andrea" })
    ];
    const r = planificar({ inicio: INICIO, empleados: equipo, ausencias: [] });
    // 7 empleadas: ni un solo día puede faltar nadie
    for (let i = 0; i < 14; i++) {
      expect(asignacionesDe(r, addDays(INICIO, i))).toHaveLength(7);
    }
    // Reparto razonable entre turnos: ambos cubiertos siempre
    for (let i = 0; i < 14; i++) {
      const turnos = asignacionesDe(r, addDays(INICIO, i)).map((a) => a.turno);
      expect(turnos).toContain("M");
      expect(turnos).toContain("T");
    }
  });

  it("avisa con huecos si no hay nadie disponible un día", () => {
    const ausencias: Ausencia[] = [
      { id: 1, empleadoId: 1, inicio: "2026-09-09", fin: "2026-09-09", tipo: "baja" },
      { id: 2, empleadoId: 2, inicio: "2026-09-09", fin: "2026-09-09", tipo: "baja" },
      { id: 3, empleadoId: 3, inicio: "2026-09-09", fin: "2026-09-09", tipo: "baja" },
      { id: 4, empleadoId: 4, inicio: "2026-09-09", fin: "2026-09-09", tipo: "baja" },
      { id: 5, empleadoId: 5, inicio: "2026-09-09", fin: "2026-09-09", tipo: "baja" }
    ];
    const r = plan({ ausencias });
    const huecosDia = r.huecos.filter((h) => h.fecha === "2026-09-09");
    expect(huecosDia.length).toBeGreaterThan(0);
  });
});
