import type { Asignacion, Ausencia, Empleado, Hueco, PlanResultado, Turno } from "./types";
import { addDays, compare, diasQuincena, inicioDeIndice } from "./dates";

/**
 * Planificador de turnos para un período quincenal (14 días: lunes a domingo ×2).
 *
 * Normas:
 *  * Todo el personal dado de alta queda asignado cada día a un turno (M o T).
 *  * Un mismo turno puede tener varias empleadas.
 *  * Alternancia semanal: si una empleada cubre mañana una semana, la siguiente
 *    le corresponde la tarde (y viceversa).
 *  * Reajuste automático: se reparte al personal de forma equilibrada priorizando
 *    su turno semanal pero garantizando la cobertura mínima de cada turno.
 *  * Se respetan las asignaciones manuales, los descansos y las celdas vacías forzadas.
 */
export interface PlanificarParams {
  inicio: string;
  empleados: Empleado[];
  ausencias: Ausencia[];
  /** Asignaciones manuales ya existentes en el período. */
  manuales?: Asignacion[];
  /** Turno dominante de cada empleada la semana anterior. */
  previa?: Map<number, Turno>;
  /** Celdas (fecha|turno) que deben quedar deliberadamente sin personal. */
  vacias?: Set<string>;
  /** Días de descanso: cadena `${empleadoId}|${fecha}`. */
  descansos?: Set<string>;
  cobertura?: number;
}

export function planificar({
  inicio,
  empleados,
  ausencias,
  manuales = [],
  previa,
  vacias = new Set(),
  descansos = new Set(),
  cobertura = 1
}: PlanificarParams): PlanResultado {
  const objetivo = Math.max(1, cobertura);
  const fin = addDays(inicio, 14);
  const dias = diasQuincena(inicio);
  const resultado: PlanResultado = { auto: [], huecos: [], sem1: {}, sem2: {} };

  // Empleadas de alta en parte del período.
  const activas = empleados
    .filter((e) => {
      if (compare(e.alta, fin) >= 0) return false;
      if (e.baja && compare(e.baja, inicio) < 0) return false;
      return true;
    })
    .sort((a, b) => a.id - b.id);

  const ausentes = ausencias.filter((a) => compare(a.inicio, fin) < 0 && compare(a.fin, inicio) >= 0);

  function disponibleDia(e: Empleado, d: string): boolean {
    if (compare(e.alta, d) > 0) return false;
    if (e.baja && compare(e.baja, d) < 0) return false;
    if (ausentes.some((a) => a.empleadoId === e.id && compare(a.inicio, d) <= 0 && compare(a.fin, d) >= 0)) return false;
    if (descansos.has(`${e.id}|${d}`)) return false;
    return true;
  }

  // --- 1) Turno semanal de cada empleada ------------------------------------
  // Alternancia: quien viene de mañana pasa a tarde la primera semana (y al
  // revés). Sin historial previo se reparten para equilibrar el equipo.
  let semilla: Record<Turno, number> = { M: 0, T: 0 };
  for (const e of activas) {
    let w0: Turno;
    if (previa && previa.has(e.id)) {
      w0 = previa.get(e.id)! === "M" ? "T" : "M"; // norma general: alterna cada semana
    } else {
      w0 = semilla.M <= semilla.T ? "M" : "T";
    }
    semilla[w0]++;
    const w1: Turno = w0 === "M" ? "T" : "M";
    resultado.sem1[e.id] = w0;
    resultado.sem2[e.id] = w1;
  }

  function turnoSemanalDe(id: number, semana: number): Turno {
    const m = semana === 0 ? resultado.sem1 : resultado.sem2;
    return m[id] ?? "M";
  }

  // Manuales del día indexadas por fecha
  const manualesPorDia = new Map<string, Asignacion[]>();
  for (const m of manuales) {
    if (compare(m.fecha, inicio) < 0 || compare(m.fecha, fin) >= 0) continue;
    const l = manualesPorDia.get(m.fecha) ?? [];
    l.push(m);
    manualesPorDia.set(m.fecha, l);
  }

  // --- 2) Reparto completo día a día -----------------------------------------
  for (let idx = 0; idx < dias.length; idx++) {
    const fecha = dias[idx];
    const semana = idx < 7 ? 0 : 1;

    const manualesHoy = manualesPorDia.get(fecha) ?? [];
    const ocupadas = new Set(manualesHoy.map((m) => m.empleadoId));
    const conteo: Record<Turno, number> = { M: 0, T: 0 };
    for (const m of manualesHoy) conteo[m.turno]++;

    function cerrada(t: Turno): boolean {
      return vacias.has(`${fecha}|${t}`);
    }

    function asignar(e: Empleado, t: Turno) {
      ocupadas.add(e.id);
      conteo[t]++;
      resultado.auto.push({ fecha, turno: t, empleadoId: e.id, origen: "auto" });
    }

    const disponibles = activas
      .filter((e) => disponibleDia(e, fecha) && !ocupadas.has(e.id))
      .sort((a, b) => a.id - b.id);

    const flex = [...disponibles];

    // 1) Turno semanal: cada empleada cubre la semana que le toca (M o T), salvo
    // que ese turno esté cerrado a propósito (entonces va al otro turno abierto).
    for (const e of flex) {
      const preferido = turnoSemanalDe(e.id, semana);
      const opuesto: Turno = preferido === "M" ? "T" : "M";
      if (cerrada(preferido) && !cerrada(opuesto)) {
        asignar(e, opuesto);
      } else if (cerrada(preferido) && cerrada(opuesto)) {
        // Ambos turnos cerrados: se respeta y no se programa a nadie extra.
      } else {
        asignar(e, preferido);
      }
    }

    // 2) Reajuste automático: si un turno abierto se queda sin la cobertura
    // mínima (por ausencias o descansos de última hora), se mueve personal del
    // otro turno para cubrirlo, sin vaciar el turno de origen por debajo del mínimo.
    const porTurno = (t: Turno) => disponibles.filter((e) =>
      resultado.auto.some((a) => a.fecha === fecha && a.empleadoId === e.id && a.turno === t));
    for (const turno of ["M", "T"] as Turno[]) {
      if (cerrada(turno)) continue;
      const opuesto: Turno = turno === "M" ? "T" : "M";
      while (conteo[turno] < objetivo && conteo[opuesto] > objetivo && !cerrada(opuesto)) {
        const candidato = porTurno(opuesto).sort((a, b) => a.id - b.id)[0];
        if (!candidato) break;
        conteo[opuesto]--;
        conteo[turno]++;
        const idx = resultado.auto.findIndex(
          (a) => a.fecha === fecha && a.empleadoId === candidato.id && a.turno === opuesto);
        if (idx >= 0) resultado.auto[idx] = { fecha, turno, empleadoId: candidato.id, origen: "auto" };
      }
    }

    // Huecos: solo cuentan los turnos no cerrados a propósito.
    for (const turno of ["M", "T"] as Turno[]) {
      if (cerrada(turno)) continue;
      if (conteo[turno] < objetivo) {
        resultado.huecos.push({
          fecha,
          turno,
          motivo: disponibles.length === 0 ? "No hay personal disponible ese día" : "No hay personal suficiente para cubrir ambos turnos"
        });
      }
    }
  }

  return resultado;
}

export { inicioDeIndice };
