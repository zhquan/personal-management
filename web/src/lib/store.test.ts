import { describe, expect, it } from "vitest";
import { plantillaEmpleado } from "./types";
import {
  anyadirPeriodoCierre,
  copiasGuardadas,
  crearCopia,
  editarDia,
  eliminarAusencia,
  eliminarEmpleado,
  eliminarTiempo,
  ejecutarCopiaSiToca,
  esDiaCerrado,
  exportarDatos,
  franjasVistaAvanzada,
  guardarAusencia,
  guardarEmpleado,
  guardarPlanAvanzado,
  guardarPlanCopia,
  guardarTiempo,
  guardarTipoTurno,
  historialDeEmpleado,
  importarDatos,
  infoTurno,
  leerPlanCopia,
  quitarPlanAvanzado,
  quitarPlanAvanzadoPorId,
  quitarTipoTurno,
  restaurarCopia,
  restaurarTurnosBase,
  setDiasCierre,
  setDiasCierreCuentanVacaciones,
  contarDiasVacaciones,
  setDuracionFranjaVistaAvanzada,
  setRangoVistaAvanzada,
  setVistaAvanzadaActivada,
  state,
  turnosAutomaticos,
  vacacionesDisponiblesAnio,
  vacacionesUsadasAnio
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
    expect(state.historial[state.historial.length - 1].texto).toContain("dado de alta");

    const e2 = guardarEmpleado({ ...e, salarioBruto: 2000 });
    expect(state.historial.length).toBe(n0 + 2);
    const entradaSalario = state.historial[state.historial.length - 1];
    expect(entradaSalario.texto).toContain("salario bruto");
    // El cambio lleva el valor anterior (para tacharlo) y el nuevo estructurados.
    expect(entradaSalario.cambios).toEqual([
      { campo: "salario bruto", antes: "—", despues: "2000" }
    ]);

    // Guardar sin cambios no debe añadir nada al historial.
    const n1 = state.historial.length;
    guardarEmpleado({ ...e2 });
    expect(state.historial.length).toBe(n1);

    const e3 = guardarEmpleado({ ...e2, baja: "2026-06-30", motivoBaja: "Renuncia voluntaria" });
    const entradaBaja = state.historial[state.historial.length - 1];
    expect(entradaBaja.texto).toContain("Baja registrada el 30/06/2026");
    expect(entradaBaja.cambios).toContainEqual({
      nota: "Baja registrada el 30/06/2026"
    });

    // Un cambio de ficha con varios campos edita antes/después de cada uno.
    const e4 = guardarEmpleado({ ...e3, telefono: "600 000 000", jornadaHoras: 30 });
    const entradaDoble = state.historial[state.historial.length - 1];
    expect(entradaDoble.cambios).toEqual([
      { campo: "teléfono", antes: "—", despues: "600 000 000" },
      { campo: "jornada (horas)", antes: "40 h", despues: "30 h" }
    ]);

    // Ausencias: alta, edición y borrado.
    const a = guardarAusencia({
      id: 0,
      empleadoId: e3.id,
      inicio: "2026-09-01",
      fin: "2026-09-03",
      tipo: "vacaciones"
    });
    expect(state.historial[state.historial.length - 1].texto).toContain("Añadido: Vacaciones");
    guardarAusencia({ ...a, fin: "2026-09-04", comentario: "ampliado" });
    expect(state.historial[state.historial.length - 1].texto).toContain("Modificado");
    eliminarAusencia(a.id);
    expect(state.historial[state.historial.length - 1].texto).toContain("Eliminado: Vacaciones");

    // Tiempo recuperable: alta, edición y borrado.
    const t = guardarTiempo({ id: 0, empleadoId: e3.id, fecha: "2026-09-10", minutos: -60 });
    expect(state.historial[state.historial.length - 1].texto).toContain("-1:00");
    guardarTiempo({ ...t, minutos: 30 });
    expect(state.historial[state.historial.length - 1].texto).toContain("+0:30");
    eliminarTiempo(t.id);
    expect(state.historial[state.historial.length - 1].texto).toContain("Eliminado apunte");

    // Orden de más reciente a más antiguo y filtrado por empleado.
    const lista = historialDeEmpleado(e3.id);
    expect(lista.every((h) => h.empleadoId === e3.id)).toBe(true);
    const ordenada = lista.every((h, i) => i === 0 || lista[i - 1].cuando >= h.cuando);
    expect(ordenada).toBe(true);
    expect(lista[0].texto).toContain("Eliminado apunte");

    // Al eliminar el empleado se borra también su historial.
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

  it("redondea exportar → importar sin perder empleados", () => {
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

describe("editarDia con origen y comentario", () => {
  const INICIO = "2026-09-07";

  it("fija un turno a mano con origen empresa y comentario", () => {
    editarDia(INICIO, "2026-09-08", 1, "M", "empresa", "Cambio pedido por RRHH");
    expect(state.asignaciones).toContainEqual(
      expect.objectContaining({
        fecha: "2026-09-08",
        empleadoId: 1,
        turno: "M",
        origen: "empresa",
        comentario: "Cambio pedido por RRHH"
      })
    );
  });

  it("fija un turno a mano con origen intercambio", () => {
    editarDia(INICIO, "2026-09-09", 2, "T", "intercambio");
    expect(state.asignaciones).toContainEqual(
      expect.objectContaining({
        fecha: "2026-09-09",
        empleadoId: 2,
        turno: "T",
        origen: "intercambio"
      })
    );
  });

  it("con turno null guarda un descanso y elimina la asignación previa", () => {
    editarDia(INICIO, "2026-09-10", 3, "M");
    editarDia(INICIO, "2026-09-10", 3, null);
    expect(state.asignaciones.some((a) => a.fecha === "2026-09-10" && a.empleadoId === 3)).toBe(false);
    expect(state.descansos).toContain("3|2026-09-10");
  });

  it("exportarDatos solo persiste lo fijado a mano (empresa o intercambio)", () => {
    const copia = exportarDatos();
    const fijados = copia.asignaciones.filter((a) => a.fecha >= INICIO && a.fecha < "2026-09-21");
    expect(fijados.length).toBeGreaterThanOrEqual(2);
    for (const a of fijados) expect(["empresa", "intercambio"]).toContain(a.origen);
  });
});

describe("migración de asignaciones antiguas", () => {
  it("importa «manual» como cambio de la empresa", () => {
    const r = importarDatos({
      empleados: [],
      ausencias: [],
      tiempos: [],
      descansos: [],
      asignaciones: [{ fecha: "2026-09-08", turno: "M", empleadoId: 1, origen: "manual" }],
      historial: []
    });
    expect(r.ok).toBe(true);
    expect(state.asignaciones).toContainEqual(
      expect.objectContaining({
        fecha: "2026-09-08",
        empleadoId: 1,
        turno: "M",
        origen: "empresa"
      })
    );
  });
});

describe("ajustes: cierre de la empresa", () => {
  it("marca como cerrados los días de la semana elegidos", () => {
    // 2026-09-07 es lunes → 2026-09-08 es martes (ISO 2).
    setDiasCierre([2]);
    expect(esDiaCerrado("2026-09-01")).toBe(true); // martes
    expect(esDiaCerrado("2026-09-08")).toBe(true); // martes
    expect(esDiaCerrado("2026-09-02")).toBe(false); // miércoles
    expect(esDiaCerrado("2026-09-06")).toBe(false); // domingo
    setDiasCierre([]);
    expect(esDiaCerrado("2026-09-01")).toBe(false);
  });

  it("marca como cerrado un período (ambas fechas incluidas)", () => {
    anyadirPeriodoCierre("2026-08-03", "2026-08-25");
    expect(esDiaCerrado("2026-08-03")).toBe(true);
    expect(esDiaCerrado("2026-08-15")).toBe(true);
    expect(esDiaCerrado("2026-08-25")).toBe(true);
    expect(esDiaCerrado("2026-08-26")).toBe(false);
    expect(esDiaCerrado("2026-08-02")).toBe(false);
  });

  it("cuenta los días de vacaciones: naturales o laborables según el cierre semanal", () => {
    // 2026-09-07 es lunes … 2026-09-13 es domingo (7 días). Con cierre el martes (ISO 2):
    // el martes 2026-09-08 no cuenta → 6 días laborables.
    setDiasCierre([2]);
    expect(contarDiasVacaciones("2026-09-07", "2026-09-13")).toEqual({ naturales: 7, laborables: 6 });
    // Un único día que es cierre semanal: 0 laborables.
    expect(contarDiasVacaciones("2026-09-08", "2026-09-08")).toEqual({ naturales: 1, laborables: 0 });
    // Sin cierres semanales, todos los días cuentan.
    setDiasCierre([]);
    expect(contarDiasVacaciones("2026-09-07", "2026-09-13")).toEqual({ naturales: 7, laborables: 7 });
    // Rango invertido o vacío: 0.
    expect(contarDiasVacaciones("2026-09-13", "2026-09-07")).toEqual({ naturales: 0, laborables: 0 });
  });

  it("el ajuste «cuentan como vacaciones» es persistente y viaja en exportar/importar", () => {
    expect(state.diasCierreCuentanVacaciones).toBe(true);
    setDiasCierreCuentanVacaciones(false);
    expect(state.diasCierreCuentanVacaciones).toBe(false);
    const datos = exportarDatos();
    expect(datos.diasCierreCuentanVacaciones).toBe(false);
    setDiasCierreCuentanVacaciones(true);
    importarDatos(datos);
    expect(state.diasCierreCuentanVacaciones).toBe(false);
    // Un archivo antiguo (sin el campo) deja el ajuste activado por defecto.
    const { diasCierreCuentanVacaciones: _omitida, ...antiguo } = datos;
    setDiasCierreCuentanVacaciones(false);
    importarDatos(antiguo);
    expect(state.diasCierreCuentanVacaciones).toBe(true);
  });

  it("vacacionesUsadasAnio descuenta los días de cierre semanal si no cuentan", () => {
    // Empleado 99 de vacaciones del lunes 07/09 al domingo 13/09 (7 días naturales).
    // Con cierre semanal el martes (ISO 2) y «no cuentan como vacaciones»:
    // se gastan 6 días laborables; con «sí cuentan» serían 7.
    guardarAusencia({
      id: 0,
      empleadoId: 99,
      inicio: "2026-09-07",
      fin: "2026-09-13",
      tipo: "vacaciones"
    });
    setDiasCierre([2]);
    setDiasCierreCuentanVacaciones(false);
    expect(vacacionesUsadasAnio(99, 2026)).toBe(6);
    setDiasCierreCuentanVacaciones(true);
    expect(vacacionesUsadasAnio(99, 2026)).toBe(7);
    // Sin cierres semanales, todos los días cuentan con el ajuste en «No».
    setDiasCierre([]);
    setDiasCierreCuentanVacaciones(false);
    expect(vacacionesUsadasAnio(99, 2026)).toBe(7);
    // Limpia para no afectar a otros tests.
    eliminarAusencia(state.ausencias.find((a) => a.empleadoId === 99)!.id);
    setDiasCierreCuentanVacaciones(true);
  });
});

describe("ajustes: tipos de turno personalizados", () => {
  it("guarda un tipo y lo incluye en la rotación automática si se marca", () => {
    guardarTipoTurno({ id: 0, nombre: "Noche", sigla: "N", color: "#1F2937", automatico: true });
    const noche = state.tiposTurno.find((t) => t.sigla === "N");
    expect(noche).toBeDefined();
    expect(noche!.automatico).toBe(true);
    expect(turnosAutomaticos()).toEqual(["M", "T", "N"]);
    expect(infoTurno("N").nombre).toBe("Noche");
    expect(infoTurno("T").nombre).toBe("Tarde");
    quitarTipoTurno(noche!.id);
    expect(state.tiposTurno.some((t) => t.sigla === "N")).toBe(false);
    expect(turnosAutomaticos()).toEqual(["M", "T"]);
  });

  it("permite fijar a mano un turno personalizado y al eliminar el tipo se quita su asignación", () => {
    guardarTipoTurno({ id: 0, nombre: "Noche", sigla: "N", color: "#1F2937", automatico: false });
    editarDia("2026-09-07", "2026-09-09", 1, "N", "empresa", "Solo esta semana");
    expect(state.asignaciones).toContainEqual(
      expect.objectContaining({
        fecha: "2026-09-09",
        empleadoId: 1,
        turno: "N",
        origen: "empresa",
        comentario: "Solo esta semana"
      })
    );
    const noche = state.tiposTurno.find((t) => t.sigla === "N");
    expect(noche).toBeDefined();
    quitarTipoTurno(noche!.id);
    expect(state.tiposTurno.some((t) => t.sigla === "N")).toBe(false);
    expect(state.asignaciones.some((a) => a.turno === "N" && a.origen !== "auto")).toBe(false);
  });
});

describe("ajustes: borrar los turnos fijos Mañana y Tarde", () => {
  it("vienen por defecto, se pueden borrar y restaurar", () => {
    expect(state.tiposTurno.map((t) => t.sigla)).toEqual(["M", "T"]);
    const manana = state.tiposTurno.find((t) => t.sigla === "M");
    expect(manana).toBeDefined();
    quitarTipoTurno(manana!.id);
    expect(state.tiposTurno.some((t) => t.sigla === "M")).toBe(false);
    expect(turnosAutomaticos()).toEqual(["T"]);
    restaurarTurnosBase();
    expect(state.tiposTurno.map((t) => t.sigla)).toEqual(["M", "T"]);
    expect(turnosAutomaticos()).toEqual(["M", "T"]);
  });

  it("no permite crear Mañana/Tarde como turnos personalizados", () => {
    const antes = state.tiposTurno.length;
    guardarTipoTurno({ id: 0, nombre: "Otro mañana", sigla: "M", color: "#112233", automatico: false });
    expect(state.tiposTurno.length).toBe(antes);
  });

  it("borra también las asignaciones a mano del turno eliminado", () => {
    editarDia("2026-09-07", "2026-09-09", 2, "T", "empresa");
    expect(state.asignaciones.some((a) => a.fecha === "2026-09-09" && a.empleadoId === 2 && a.origen !== "auto")).toBe(true);
    const tarde = state.tiposTurno.find((t) => t.sigla === "T");
    quitarTipoTurno(tarde!.id);
    expect(state.asignaciones.some((a) => a.turno === "T" && a.origen !== "auto")).toBe(false);
    restaurarTurnosBase();
  });
});

describe("ajustes: vista Avanzada del calendario", () => {
  it("Mañana y Tarde traen horario por defecto (desde/hasta)", () => {
    const manana = state.tiposTurno.find((t) => t.sigla === "M");
    const tarde = state.tiposTurno.find((t) => t.sigla === "T");
    expect(manana).toBeDefined();
    expect(tarde).toBeDefined();
    expect(manana!.desde).toBe("06:00");
    expect(manana!.hasta).toBe("14:00");
    expect(tarde!.desde).toBe("14:00");
    expect(tarde!.hasta).toBe("22:00");
  });

  it("permite cambiar el horario de Mañana/Tarde sin alterar su sigla", () => {
    const manana = state.tiposTurno.find((t) => t.sigla === "M")!;
    guardarTipoTurno({ ...manana, desde: "07:00", hasta: "15:00" });
    const editado = state.tiposTurno.find((t) => t.sigla === "M")!;
    expect(editado.desde).toBe("07:00");
    expect(editado.hasta).toBe("15:00");
    expect(editado.sigla).toBe("M");
    expect(editado.id).toBeLessThan(0);
    // Lo dejamos como estaba por defecto.
    guardarTipoTurno({ ...editado, desde: "06:00", hasta: "14:00" });
  });

  it("guarda el rango de franjas y lo rechaza si no es válido", () => {
    expect(setRangoVistaAvanzada("08:00", "14:00")).toBe("");
    let f = franjasVistaAvanzada();
    expect(f).toHaveLength(12);
    expect(f[0]).toEqual({ desde: "08:00", hasta: "08:30" });
    expect(f[11]).toEqual({ desde: "13:30", hasta: "14:00" });

    const mensaje = setRangoVistaAvanzada("22:00", "06:00");
    expect(mensaje).not.toBe("");
    expect(setRangoVistaAvanzada("xx", "06:00")).not.toBe("");
    // El rango anterior se conserva.
    expect(franjasVistaAvanzada()[0]).toEqual({ desde: "08:00", hasta: "08:30" });
    // Restauramos el rango por defecto del ejemplo.
    expect(setRangoVistaAvanzada("06:00", "22:00")).toBe("");
    expect(franjasVistaAvanzada()).toHaveLength(32);
  });

  it("permite cambiar la duración de cada franja en HH:MM", () => {
    expect(setRangoVistaAvanzada("06:00", "22:00")).toBe("");
    expect(franjasVistaAvanzada()).toHaveLength(32); // 00:30 por defecto
    // Franjas de 1 hora.
    expect(setDuracionFranjaVistaAvanzada("01:00")).toBe("");
    let f = franjasVistaAvanzada();
    expect(f).toHaveLength(16);
    expect(f[0]).toEqual({ desde: "06:00", hasta: "07:00" });
    // Rechaza duraciones inválidas o que no dividen el rango (16 h).
    expect(setDuracionFranjaVistaAvanzada("00:45")).not.toBe("");
    expect(setDuracionFranjaVistaAvanzada("00:05")).not.toBe("");
    expect(setDuracionFranjaVistaAvanzada("xx")).not.toBe("");
    expect(state.duracionFranjaVistaAvanzada).toBe(60); // se conserva la anterior
    // Rechaza un rango que no encaja en la duración configurada.
    expect(setRangoVistaAvanzada("06:30", "20:15")).not.toBe("");
    expect(state.desdeVistaAvanzada).toBe("06:00");
    // Restauramos duración y rango por defecto.
    expect(setDuracionFranjaVistaAvanzada("00:30")).toBe("");
    expect(setRangoVistaAvanzada("06:00", "22:00")).toBe("");
    expect(franjasVistaAvanzada()).toHaveLength(32);
  });
});

describe("planificación por horas de la vista Avanzada", () => {
  it("permite varios tramos del mismo empleado el mismo día si no se solapan", () => {
    quitarPlanAvanzado("2026-09-10", 1);
    quitarPlanAvanzado("2026-09-10", 2);
    // Primer tramo de la mañana.
    expect(guardarPlanAvanzado("2026-09-10", 1, "09:00", "11:00")).toBe("");
    expect(state.planAvanzada).toContainEqual(
      expect.objectContaining({
        empleadoId: 1,
        fecha: "2026-09-10",
        desde: "09:00",
        hasta: "11:00"
      })
    );
    // Segundo tramo del mismo empleado el mismo día: se añade, no sustituye.
    expect(guardarPlanAvanzado("2026-09-10", 1, "14:00", "18:00")).toBe("");
    const delDia = state.planAvanzada.filter((p) => p.fecha === "2026-09-10" && p.empleadoId === 1);
    expect(delDia).toHaveLength(2);
    expect(delDia.map((p) => p.desde).sort()).toEqual(["09:00", "14:00"]);
    // Un tramo contiguo (sin solaparse) también se admite.
    expect(guardarPlanAvanzado("2026-09-10", 1, "11:00", "14:00")).toBe("");
    // Se rechaza un tramo que se solape con otro suyo del mismo día.
    expect(guardarPlanAvanzado("2026-09-10", 1, "10:00", "12:00")).not.toBe("");
    expect(guardarPlanAvanzado("2026-09-10", 1, "13:00", "15:00")).not.toBe("");
    // Rechaza horas inválidas.
    expect(guardarPlanAvanzado("2026-09-10", 1, "14:00", "06:00")).not.toBe("");
    expect(guardarPlanAvanzado("2026-09-10", 1, "xx", "06:00")).not.toBe("");
    // Distintos empleados pueden trabajar las mismas horas sin conflicto.
    expect(guardarPlanAvanzado("2026-09-10", 2, "09:00", "11:00")).toBe("");
    // limpieza de prueba al final
    quitarPlanAvanzado("2026-09-10", 1);
    quitarPlanAvanzado("2026-09-10", 2);
  });

  it("quita un tramo concreto (por id) sin afectar a los demás del día", () => {
    quitarPlanAvanzado("2026-09-12", 1);
    guardarPlanAvanzado("2026-09-12", 1, "09:00", "11:00");
    guardarPlanAvanzado("2026-09-12", 1, "14:00", "18:00");
    const manana = state.planAvanzada.find(
      (p) => p.fecha === "2026-09-12" && p.empleadoId === 1 && p.desde === "09:00")!;
    const tarde = state.planAvanzada.find(
      (p) => p.fecha === "2026-09-12" && p.empleadoId === 1 && p.desde === "14:00")!;
    expect(manana.id).not.toBe(tarde.id);
    quitarPlanAvanzadoPorId(manana.id);
    expect(state.planAvanzada.some((p) => p.id === manana.id)).toBe(false);
    expect(state.planAvanzada.some((p) => p.id === tarde.id)).toBe(true);
    // limpieza de prueba al final
    quitarPlanAvanzado("2026-09-12", 1);
  });

  it("quita todos los tramos de un empleado en un día y se limpia al eliminar al empleado", () => {
    quitarPlanAvanzado("2026-09-11", 1);
    guardarPlanAvanzado("2026-09-11", 1, "06:00", "14:00");
    guardarPlanAvanzado("2026-09-11", 2, "14:00", "22:00");
    quitarPlanAvanzado("2026-09-11", 1);
    expect(state.planAvanzada.some((p) => p.fecha === "2026-09-11" && p.empleadoId === 1)).toBe(false);
    expect(state.planAvanzada.some((p) => p.fecha === "2026-09-11" && p.empleadoId === 2)).toBe(true);
    // limpieza de prueba al final
    quitarPlanAvanzado("2026-09-11", 2);
  });

  it("viaja en exportar/importar", () => {
    quitarPlanAvanzado("2026-09-15", 1);
    guardarPlanAvanzado("2026-09-15", 1, "06:00", "14:00");
    const datos = exportarDatos();
    expect(datos.planAvanzada.some((p) => p.fecha === "2026-09-15" && p.empleadoId === 1)).toBe(true);
    const r = importarDatos({
      ...datos,
      planAvanzada: [{ id: 1, empleadoId: 9, fecha: "2026-09-16", desde: "09:00", hasta: "18:00" }]
    });
    expect(r.ok).toBe(true);
    expect(state.planAvanzada).toContainEqual(
      expect.objectContaining({ empleadoId: 9, fecha: "2026-09-16", desde: "09:00", hasta: "18:00" })
    );
    // Sin planAvanzada en el archivo antiguo se vacía sin romper.
    importarDatos({
      ...datos,
      planAvanzada: undefined as never
    });
    expect(state.planAvanzada).toEqual([]);
  });

  it("la vista Avanzada se puede activar/desactivar y viaja en exportar/importar", () => {
    // Por defecto está activada.
    expect(state.vistaAvanzadaActivada).toBe(true);
    setVistaAvanzadaActivada(false);
    expect(state.vistaAvanzadaActivada).toBe(false);
    const datos = exportarDatos();
    expect(datos.vistaAvanzadaActivada).toBe(false);
    // La desactivación sobrevive a una importación.
    setVistaAvanzadaActivada(true);
    importarDatos(datos);
    expect(state.vistaAvanzadaActivada).toBe(false);
    // Un archivo antiguo (sin el campo) deja la vista activada.
    const { vistaAvanzadaActivada: _omitida, ...antiguo } = datos;
    setVistaAvanzadaActivada(false);
    importarDatos(antiguo);
    expect(state.vistaAvanzadaActivada).toBe(true);
  });
});
