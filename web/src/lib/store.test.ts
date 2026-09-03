import { describe, expect, it } from "vitest";
import { plantillaEmpleado } from "./types";
import {
  copiasGuardadas,
  crearCopia,
  eliminarAusencia,
  eliminarEmpleado,
  eliminarTiempo,
  ejecutarCopiaSiToca,
  exportarDatos,
  guardarAusencia,
  guardarEmpleado,
  guardarPlanCopia,
  guardarTiempo,
  historialDeEmpleado,
  importarDatos,
  leerPlanCopia,
  restaurarCopia,
  state,
  vacacionesDisponiblesAnio
} from "./store";

describe("guardarAusencia", () => {
  it("actualiza un registro existente al editar (no duplica)", () => {
    const nueva = guardarAusencia({
      id: 0,
      empleadoId: 1,
      inicio: "2026-09-01",
      fin: "2026-09-03",
      tipo: "vacaciones"
    });
    expect(nueva.id).toBeGreaterThan(0);
    expect(state.ausencias).toHaveLength(1);

    guardarAusencia({
      id: nueva.id,
      empleadoId: 1,
      inicio: "2026-09-10",
      fin: "2026-09-12",
      tipo: "asuntos",
      comentario: "editada"
    });

    expect(state.ausencias).toHaveLength(1);
    expect(state.ausencias[0]).toMatchObject({
      id: nueva.id,
      inicio: "2026-09-10",
      fin: "2026-09-12",
      tipo: "asuntos",
      comentario: "editada"
    });
  });
});

describe("vacacionesDisponiblesAnio", () => {
  const e = (alta: string, extra: Partial<{ baja: string; dias: number }> = {}) => ({
    alta,
    baja: extra.baja ?? null,
    diasVacacionesAnuales: extra.dias ?? 30
  });

  it("año completo si el alta es anterior al año", () => {
    expect(vacacionesDisponiblesAnio(e("2025-06-15"), 2026)).toBe(30);
    expect(vacacionesDisponiblesAnio(e("2024-01-01"), 2026)).toBe(30);
  });

  it("alta el 1 de noviembre → 5 días (2 meses de 61 días de 365)", () => {
    expect(vacacionesDisponiblesAnio(e("2026-11-01"), 2026)).toBe(5);
  });

  it("alta a mitad de mes se prorratea por días exactos", () => {
    // 15/11 → 31/12 = 47 días → 30×47/365 = 3,86 → 4
    expect(vacacionesDisponiblesAnio(e("2026-11-15"), 2026)).toBe(4);
    // 1/3 → 31/12 = 306 días → 30×306/365 = 25,15 → 25
    expect(vacacionesDisponiblesAnio(e("2026-03-01"), 2026)).toBe(25);
  });

  it("baja a mitad de año prorratea hasta la fecha de baja", () => {
    // 1/1 → 30/6 (181 días) → 30×181/365 = 14,88 → 15
    expect(vacacionesDisponiblesAnio(e("2024-01-01", { baja: "2026-06-30" }), 2026)).toBe(15);
    // alta y baja dentro del año: 10/9 → 5/10 (26 días) → 30×26/365 = 2,14 → 2
    expect(vacacionesDisponiblesAnio(e("2026-09-10", { baja: "2026-10-05" }), 2026)).toBe(2);
  });

  it("baja en un año anterior → 0 días ese año", () => {
    expect(vacacionesDisponiblesAnio(e("2024-03-01", { baja: "2025-03-01" }), 2026)).toBe(0);
  });

  it("año bisiesto usa 366 días", () => {
    // 1/11 → 31/12 de 2028 = 61 días de 366 → 30×61/366 = 5 exacto
    expect(vacacionesDisponiblesAnio(e("2028-11-01"), 2028)).toBe(5);
  });

  it("respeta los días anuales configurados (no solo 30)", () => {
    // 22 anuales · alta 1/11 → 61/365·22 = 3,68 → 4
    expect(vacacionesDisponiblesAnio(e("2026-11-01", { dias: 22 }), 2026)).toBe(4);
  });

  it("desde el 1 de enero del año siguiente vuelve a corresponder el año completo", () => {
    expect(vacacionesDisponiblesAnio(e("2026-11-01"), 2027)).toBe(30);
  });
});

describe("historial de acciones", () => {
  it("anota cambios de ficha (incluida la baja), ausencias y tiempo recuperable", () => {
    const n0 = state.historial.length;
    const e = guardarEmpleado(plantillaEmpleado({ nombre: "Ana", apellidos: "Prueba", alta: "2026-01-01" }));
    expect(state.historial.length).toBe(n0 + 1); // alta
    expect(state.historial[state.historial.length - 1].texto).toContain("dada de alta");

    const e2 = guardarEmpleado({ ...e, salarioBruto: 2000 });
    expect(state.historial.length).toBe(n0 + 2);
    expect(state.historial[state.historial.length - 1].texto).toContain("salario bruto");

    // Guardar sin cambios no debe añadir nada al historial.
    const n1 = state.historial.length;
    guardarEmpleado({ ...e2 });
    expect(state.historial.length).toBe(n1);

    const e3 = guardarEmpleado({ ...e2, baja: "2026-06-30", motivoBaja: "Renuncia voluntaria" });
    expect(state.historial[state.historial.length - 1].texto).toContain("Baja registrada el 30/06/2026");

    // Ausencias: alta, edición y borrado.
    const a = guardarAusencia({
      id: 0,
      empleadoId: e3.id,
      inicio: "2026-09-01",
      fin: "2026-09-03",
      tipo: "vacaciones"
    });
    expect(state.historial[state.historial.length - 1].texto).toContain("Añadida Vacaciones");
    guardarAusencia({ ...a, fin: "2026-09-04", comentario: "ampliado" });
    expect(state.historial[state.historial.length - 1].texto).toContain("Modificada");
    eliminarAusencia(a.id);
    expect(state.historial[state.historial.length - 1].texto).toContain("Eliminada Vacaciones");

    // Tiempo recuperable: alta, edición y borrado.
    const t = guardarTiempo({ id: 0, empleadoId: e3.id, fecha: "2026-09-10", minutos: -60 });
    expect(state.historial[state.historial.length - 1].texto).toContain("-1:00");
    guardarTiempo({ ...t, minutos: 30 });
    expect(state.historial[state.historial.length - 1].texto).toContain("+0:30");
    eliminarTiempo(t.id);
    expect(state.historial[state.historial.length - 1].texto).toContain("Eliminado apunte");

    // Orden de más reciente a más antiguo y filtrado por empleada.
    const lista = historialDeEmpleado(e3.id);
    expect(lista.every((h) => h.empleadoId === e3.id)).toBe(true);
    const ordenada = lista.every((h, i) => i === 0 || lista[i - 1].cuando >= h.cuando);
    expect(ordenada).toBe(true);
    expect(lista[0].texto).toContain("Eliminado apunte");

    // Al eliminar la empleada se borra también su historial.
    eliminarEmpleado(e3.id);
    expect(historialDeEmpleado(e3.id)).toHaveLength(0);
  });
});

describe("exportación e importación", () => {
  it("rechaza datos que no son una copia", () => {
    expect(importarDatos(null).ok).toBe(false);
    expect(importarDatos({ x: 1 }).ok).toBe(false);
    expect(importarDatos({ empleados: "no" }).ok).toBe(false);
  });

  it("redondea exportar → importar sin perder empleadas", () => {
    const copia = exportarDatos();
    const n = state.empleados.length;
    const r = importarDatos(copia);
    expect(r.ok).toBe(true);
    expect(state.empleados.length).toBe(n);
    expect(r.empleados).toBe(n);
  });
});

describe("copias de seguridad", () => {
  it("crea, rota según el plan y respeta la frecuencia", () => {
    guardarPlanCopia({ activo: true, frecuencia: "dia", maxCopias: 2, ultima: null });
    crearCopia();
    crearCopia();
    crearCopia();
    expect(copiasGuardadas().length).toBe(2); // rotación a las 2 últimas
    const p = leerPlanCopia();
    expect(p.ultima).toBe(copiasGuardadas()[0].creado);

    // Recién hecha (hoy) no vuelve a ejecutarse.
    const antes = copiasGuardadas().length;
    expect(ejecutarCopiaSiToca()).toBe(false);
    expect(copiasGuardadas().length).toBe(antes);

    // Si la última copia es antigua (hace 2 días), vuelve a ejecutarse.
    guardarPlanCopia({ ...leerPlanCopia(), ultima: new Date(Date.now() - 2 * 864e5).toISOString() });
    expect(ejecutarCopiaSiToca()).toBe(true);
    expect(copiasGuardadas().length).toBe(2);

    // Plan desactivado: no ejecuta.
    guardarPlanCopia({ ...leerPlanCopia(), activo: false });
    expect(ejecutarCopiaSiToca()).toBe(false);
  });

  it("restaura desde una copia guardada", () => {
    const guardar = crearCopia();
    const r = restaurarCopia(guardar.id);
    expect(r.ok).toBe(true);
    expect(leerPlanCopia().activo).toBe(false);
  });
});

describe("guardarTiempo", () => {
  it("actualiza un apunte existente al editar (no duplica)", () => {
    const nuevo = guardarTiempo({ id: 0, empleadoId: 2, fecha: "2026-09-05", minutos: -90 });
    expect(state.tiempos).toHaveLength(1);

    guardarTiempo({ id: nuevo.id, empleadoId: 2, fecha: "2026-09-06", minutos: 45, comentario: "cambio" });

    expect(state.tiempos).toHaveLength(1);
    expect(state.tiempos[0]).toMatchObject({
      id: nuevo.id,
      fecha: "2026-09-06",
      minutos: 45,
      comentario: "cambio"
    });
  });
});
