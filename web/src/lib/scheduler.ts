import type { Asignacion, Ausencia, Empleado, Hueco, PlanResultado, TipoTurno, Turno } from "./types";
import { TIPOS_TURNO_BASE } from "./types";
import { addDays, compare, diasQuincena, inicioDeIndice } from "./dates";

/**
 * Planificador de turnos para un período quincenal (14 días: lunes a domingo ×2).
 *
 * Normas:
 *  * Todo el personal dado de alta queda asignado cada día a un turno.
 *  * Un mismo turno puede tener varios empleados.
 *  * Rotación semanal: si un empleado cubre mañana una semana, la siguiente le
 *    corresponde el siguiente turno de la rotación (T, y así con los turnos
 *    personalizados marcados como automáticos). Si Mañana o Tarde se han
 *    borrado en Ajustes, no entran en la rotación.
 *  * Reajuste automático: se reparte al personal de forma equilibrada priorizando
 *    su turno semanal pero garantizando la cobertura mínima de cada turno.
 *  * Se respetan las asignaciones manuales, los descansos, las celdas vacías
 *    forzadas y los días en que la empresa cierra (no se programa a nadie).
 */
export interface PlanificarParams {
  inicio: string;
  empleados: Empleado[];
  ausencias: Ausencia[];
  /** Asignaciones manuales ya existentes en el período. */
  manuales?: Asignacion[];
  /** Turno dominante de cada empleado la semana anterior. */
  previa?: Map<number, Turno>;
  /** Celdas (fecha|turno) que deben quedar deliberadamente sin personal. */
  vacias?: Set<string>;
  /** Días de descanso: cadena `${empleadoId}|${fecha}`. */
  descansos?: Set<string>;
  /** Tipos de turno definidos (base + personalizados); solo entran los automáticos. */
  tipos?: TipoTurno[];
  /** Fechas (ISO) en que la empresa está cerrada: ese día no se programa a nadie. */
  cerrados?: Set<string>;
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
  tipos,
  cerrados = new Set(),
  cobertura = 1
}: PlanificarParams): PlanResultado {
  const objetivo = Math.max(1, cobertura);
  const fin = addDays(inicio, 14);
  const dias = diasQuincena(inicio);
  const resultado: PlanResultado = { auto: [], huecos: [], sem1: {}, sem2: {} };

  // Rotación automática: la lista de turnos definidos marcados como automáticos
  // (Mañana y Tarde al principio; si se borraron en Ajustes, no aparecen).
  const definidos: TipoTurno[] = tipos ?? TIPOS_TURNO_BASE;
  const rotacion: Turno[] = definidos.filter((t) => t.automatico).map((t) => t.sigla);
  if (rotacion.length === 0) return resultado; // sin turnos automáticos no hay nada que programar

  function siguienteEnRotacion(t: Turno): Turno {
    const i = rotacion.indexOf(t);
    return rotacion[(i + 1) % rotacion.length];
  }
  function vaciarConteo(): Record<Turno, number> {
    return Object.fromEntries(rotacion.map((t) => [t, 0]));
  }

  // Empleados de alta en parte del período.
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

  // --- 1) Turno semanal de cada empleado ------------------------------------
  // Rotación semanal: quien viene de mañana pasa a tarde la primera semana, y
  // quien viene de tarde pasa al siguiente turno de la rotación (y así con los
  // personalizados). Sin historial previo se reparten para equilibrar el equipo.
  let semilla: Record<Turno, number> = vaciarConteo();
  for (const e of activas) {
    let w0: Turno;
    if (previa && previa.has(e.id)) {
      w0 = siguienteEnRotacion(previa.get(e.id)!);
    } else {
      // El turno con menos personal asignado hasta ahora (el primero si hay empate).
      w0 = rotacion.reduce((min, t) => (semilla[t] < semilla[min] ? t : min), rotacion[0]);
    }
    semilla[w0]++;
    resultado.sem1[e.id] = w0;
    resultado.sem2[e.id] = siguienteEnRotacion(w0);
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

    // Día de cierre de la empresa: no se programa a nadie (lo manual se conserva).
    if (cerrados.has(fecha)) continue;

    const manualesHoy = manualesPorDia.get(fecha) ?? [];
    const ocupadas = new Set(manualesHoy.map((m) => m.empleadoId));
    const conteo: Record<Turno, number> = vaciarConteo();
    for (const m of manualesHoy) conteo[m.turno] = (conteo[m.turno] ?? 0) + 1;

    function cerrada(t: Turno): boolean {
      return vacias.has(`${fecha}|${t}`);
    }

    function asignar(e: Empleado, t: Turno) {
      ocupadas.add(e.id);
      conteo[t] = (conteo[t] ?? 0) + 1;
      resultado.auto.push({ fecha, turno: t, empleadoId: e.id, origen: "auto" });
    }

    const disponibles = activas
      .filter((e) => disponibleDia(e, fecha) && !ocupadas.has(e.id))
      .sort((a, b) => a.id - b.id);

    const flex = [...disponibles];

    // 1) Turno semanal: cada empleado cubre el turno que le toca esa semana; si
    // ese turno está cerrado a propósito, pasa al primer turno abierto.
    for (const e of flex) {
      const preferido = turnoSemanalDe(e.id, semana);
      if (cerrada(preferido)) {
        const abierto = rotacion.find((t) => !cerrada(t));
        if (abierto) asignar(e, abierto);
        // Todos los turnos cerrados: se respeta y no se programa a nadie extra.
      } else {
        asignar(e, preferido);
      }
    }

    // 2) Reajuste automático: si un turno abierto se queda sin la cobertura
    // mínima (por ausencias o descansos de última hora), se mueve personal de
    // otro turno con excedente para cubrirlo, sin vaciar el de origen del mínimo.
    const porTurno = (t: Turno) => disponibles.filter((e) =>
      resultado.auto.some((a) => a.fecha === fecha && a.empleadoId === e.id && a.turno === t));
    for (const turno of rotacion) {
      if (cerrada(turno)) continue;
      while ((conteo[turno] ?? 0) < objetivo) {
        const origen = rotacion.find((t) => t !== turno && !cerrada(t) && (conteo[t] ?? 0) > objetivo);
        if (!origen) break;
        const candidato = porTurno(origen).sort((a, b) => a.id - b.id)[0];
        if (!candidato) break;
        conteo[origen]--;
        conteo[turno]++;
        const idx = resultado.auto.findIndex(
          (a) => a.fecha === fecha && a.empleadoId === candidato.id && a.turno === origen);
        if (idx >= 0) resultado.auto[idx] = { fecha, turno, empleadoId: candidato.id, origen: "auto" };
      }
    }

    // Huecos: solo cuentan los turnos no cerrados a propósito.
    for (const turno of rotacion) {
      if (cerrada(turno)) continue;
      if ((conteo[turno] ?? 0) < objetivo) {
        resultado.huecos.push({
          fecha,
          turno,
          motivo: disponibles.length === 0 ? "No hay personal disponible ese día" : "No hay personal suficiente para cubrir todos los turnos"
        });
      }
    }
  }

  return resultado;
}

export { inicioDeIndice };
