import { describe, expect, it } from "vitest";
import { plantillaEmpleado } from "./types";
import type { Empleado } from "./types";
import {
  aniosEntre,
  edadesEmpleados,
  mesesEntre,
  rangoPorDefecto,
  rangosEdad,
  serieAltasBajasActual,
  serieDuracionMedia,
  serieSalarioMedio
} from "./dashboard";

function emp(parcial: Partial<Empleado>): Empleado {
  return plantillaEmpleado(parcial);
}

const FILTRO_TODOS = { estado: "todos" as const, desde: "2026-01-01", hasta: "2026-03-31" };

describe("rangoPorDefecto", () => {
  it("devuelve el último año (hasta hoy incluido)", () => {
    const r = rangoPorDefecto("2026-09-06");
    expect(r.hasta).toBe("2026-09-06");
    expect(r.desde).toBe("2025-09-07"); // 364 días antes
  });
});

describe("mesesEntre", () => {
  it("genera los meses completos del rango con sus fechas", () => {
    const meses = mesesEntre("2026-01-10", "2026-03-05");
    expect(meses.map((m) => m.etiqueta)).toEqual(["ene 26", "feb 26", "mar 26"]);
    expect(meses[0]).toEqual({ etiqueta: "ene 26", inicio: "2026-01-01", fin: "2026-01-31" });
    expect(meses[1].fin).toBe("2026-02-28");
    expect(meses[2].fin).toBe("2026-03-31");
  });

  it("cruza de año", () => {
    const meses = mesesEntre("2026-12-15", "2027-02-01");
    expect(meses.map((m) => m.etiqueta)).toEqual(["dic 26", "ene 27", "feb 27"]);
  });

  it("rango invertido o vacío → []", () => {
    expect(mesesEntre("2026-03-01", "2026-01-01")).toEqual([]);
    expect(mesesEntre("", "")).toEqual([]);
  });
});

describe("serieAltasBajasActual", () => {
  const plantilla = [
    // Alta dentro del rango, sigue activo.
    emp({ id: 1, alta: "2026-01-15", salarioBruto: 2000 }),
    // Alta dentro del rango y baja también.
    emp({ id: 2, alta: "2026-01-20", baja: "2026-02-10", salarioBruto: null }),
    // Alta anterior al rango, sigue activo.
    emp({ id: 3, alta: "2025-11-01", salarioBruto: 1000 })
  ];

  it("cuenta altas, bajas y plantilla a fin de mes (todos)", () => {
    const s = serieAltasBajasActual(plantilla, FILTRO_TODOS);
    expect(s.etiquetas).toEqual(["ene 26", "feb 26", "mar 26"]);
    expect(s.altas).toEqual([2, 0, 0]);
    expect(s.bajas).toEqual([0, 1, 0]);
    // Fin de enero: 1, 2 y 3 → 3 · fin de febrero: 1 y 3 → 2 · fin de marzo: 2
    expect(s.actual).toEqual([3, 2, 2]);
  });

  it("con «activos» solo entran los que siguen trabajando (sin bajas)", () => {
    const s = serieAltasBajasActual(plantilla, { ...FILTRO_TODOS, estado: "activos" });
    expect(s.altas).toEqual([1, 0, 0]);
    expect(s.bajas).toEqual([0, 0, 0]);
    expect(s.actual).toEqual([2, 2, 2]);
  });

  it("con «no activos» solo entran los dados de baja", () => {
    const s = serieAltasBajasActual(plantilla, { ...FILTRO_TODOS, estado: "noactivos" });
    expect(s.altas).toEqual([1, 0, 0]);
    expect(s.bajas).toEqual([0, 1, 0]);
    expect(s.actual).toEqual([1, 0, 0]);
  });

  it("quien causa baja a mitad de mes ya no cuenta a fin de ese mes", () => {
    const lista = [
      emp({ id: 1, alta: "2025-01-01", baja: "2026-01-15" }),
      emp({ id: 2, alta: "2025-01-01" })
    ];
    const s = serieAltasBajasActual(lista, FILTRO_TODOS);
    expect(s.actual).toEqual([1, 1, 1]); // el 1 deja de contar desde enero (baja el 15)
    expect(s.bajas).toEqual([1, 0, 0]);
  });
});

describe("serieSalarioMedio", () => {
  const plantilla = [
    emp({ id: 1, alta: "2026-01-15", salarioBruto: 2000 }),
    emp({ id: 2, alta: "2026-01-20", baja: "2026-02-10", salarioBruto: null }),
    emp({ id: 3, alta: "2025-11-01", salarioBruto: 1000 })
  ];

  it("promedia solo a quien está en plantilla y tiene salario", () => {
    const s = serieSalarioMedio(plantilla, FILTRO_TODOS);
    // Enero: 2000 + 1000 (el 2 no tiene salario) → 1500 · Febrero y marzo: 1500
    expect(s.valores).toEqual([1500, 1500, 1500]);
  });

  it("devuelve null en meses sin nadie en plantilla", () => {
    const lista = [emp({ id: 1, alta: "2026-02-01", baja: "2026-03-15", salarioBruto: 900 })];
    const s = serieSalarioMedio(lista, FILTRO_TODOS);
    expect(s.valores).toEqual([null, 900, null]); // febrero sí, marzo ya no está a fin de mes
  });
});

describe("serieDuracionMedia", () => {
  const plantilla = [
    emp({ id: 1, alta: "2026-01-15" }),
    emp({ id: 2, alta: "2025-11-01" })
  ];

  it("promedia la antigüedad (meses completos) a fin de cada mes", () => {
    const s = serieDuracionMedia(plantilla, FILTRO_TODOS);
    // 31/01: 0 y 2 meses → 1,0 · 28/02: 1 y 3 → 2,0 · 31/03: 2 y 4 → 3,0
    expect(s.valores).toEqual([1, 2, 3]);
  });

  it("la antigüedad crece hasta que deja de estar en plantilla", () => {
    const lista = [emp({ id: 1, alta: "2025-06-01", baja: "2026-03-10" })];
    const s = serieDuracionMedia(lista, FILTRO_TODOS);
    // 31/01: 7 meses · 28/02: 8 meses · 31/03: ya no está (baja el 10)
    expect(s.valores).toEqual([7, 8, null]);
  });
});

describe("edadesEmpleados y rangosEdad", () => {
  const plantilla = [
    emp({ id: 1, nombre: "Ana", apellidos: "Uno", nacimiento: "1990-05-08" }),
    emp({ id: 2, nombre: "Bea", apellidos: "Dos", nacimiento: "2001-09-10" }),
    emp({ id: 3, nombre: "Carla", apellidos: "Tres", nacimiento: null }) // sin fecha
  ];

  it("aniosEntre calcula la edad cumplida", () => {
    expect(aniosEntre("1990-05-08", "2026-09-06")).toBe(36);
    expect(aniosEntre("2001-09-10", "2026-09-06")).toBe(24); // aún no cumple 25
    expect(aniosEntre("2001-09-06", "2026-09-06")).toBe(25);
  });

  it("usa hoy como referencia si el fin del rango es futuro y omite sin nacimiento", () => {
    const fut = { ...FILTRO_TODOS, hasta: "2027-12-31" };
    const edades = edadesEmpleados(plantilla, fut, "2026-09-06");
    expect(edades.map((e) => e.edad).sort()).toEqual([24, 36]);
  });

  it("excluye a quien no trabajó dentro del rango", () => {
    // Alta posterior al fin del rango.
    const recien = emp({ id: 4, nombre: "Dani", apellidos: "Cuatro", nacimiento: "1995-01-01", alta: "2026-05-01" });
    // Baja anterior al inicio del rango.
    const antiguo = emp({ id: 5, nombre: "Eva", apellidos: "Cinco", nacimiento: "1980-01-01", alta: "2010-01-01", baja: "2020-12-31" });
    const edades = edadesEmpleados([...plantilla, recien, antiguo], FILTRO_TODOS, "2026-09-06");
    expect(edades.map((e) => e.nombre)).not.toContain("Dani Cuatro");
    expect(edades.map((e) => e.nombre)).not.toContain("Eva Cinco");
  });

  it("agrupa en rangos de 5 años con el límite superior en el siguiente rango", () => {
    const edades = [
      { edad: 22, nombre: "A" },
      { edad: 24, nombre: "B" },
      { edad: 25, nombre: "C" }, // cae en 25–30
      { edad: 27, nombre: "D" },
      { edad: 36, nombre: "E" }
    ];
    expect(rangosEdad(edades)).toEqual([
      { etiqueta: "20–25", valor: 2 },
      { etiqueta: "25–30", valor: 2 },
      { etiqueta: "30–35", valor: 0 },
      { etiqueta: "35–40", valor: 1 }
    ]);
  });

  it("el último rango incluye su límite superior y sin edades devuelve []", () => {
    expect(rangosEdad([{ edad: 40, nombre: "X" }])).toEqual([{ etiqueta: "40–45", valor: 1 }]);
    expect(rangosEdad([])).toEqual([]);
  });
});