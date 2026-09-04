// Utilidades de horas (HH:MM) para la vista Avanzada del calendario de turnos:
// genera las franjas de un rango horario (con duración configurable) y comprueba
// si un turno «por hora» cubre cada franja.

/** Franja de tiempo, p. ej. «06:00» → «06:30» (ambos HH:MM). */
export interface Franja {
  desde: string;
  hasta: string;
}

/** Duración por defecto de cada franja de la vista Avanzada (30 minutos). */
export const MINUTOS_FRANJA = 30;

/** Mínimo/máximo razonables para la duración de una franja (10 min – 4 h). */
export const MIN_FRANJA_MINUTOS = 10;
export const MAX_FRANJA_MINUTOS = 240;

const RE_HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Minutos desde medianoche de una hora «HH:MM» (o null si no es válida). */
export function minutosDe(hora: string): number | null {
  const m = RE_HORA.exec((hora ?? "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Devuelve la hora «HH:MM» normalizada (con cero a la izquierda) o null. */
export function normalizarHora(hora: string): string | null {
  const min = minutosDe(hora);
  if (min === null) return null;
  return minutosAFormato(min);
}

/** Formatea minutos a «HH:MM» (p. ej. 30 → «00:30», 90 → «01:30», 420 → «07:00»). */
export function minutosAFormato(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Franjas de `duracionMin` minutos entre `desde` y `hasta` (ambas HH:MM del mismo
 * día). La última franja termina exactamente en `hasta` cuando el rango es
 * divisible por la duración (p. ej. 06:00–22:00 con 30 min → 32 franjas de
 * «06:00–06:30» a «21:30–22:00»). Vacía si el rango o la duración no son válidos
 * (faltan horas, `hasta` no es posterior a `desde`, o la duración no es positiva).
 */
export function generarFranjas(
  desde: string,
  hasta: string,
  duracionMin: number = MINUTOS_FRANJA
): Franja[] {
  const a = minutosDe(desde);
  const b = minutosDe(hasta);
  const paso = Math.floor(duracionMin);
  if (a === null || b === null || b <= a || paso <= 0) return [];
  const out: Franja[] = [];
  for (let ini = a; ini + paso <= b; ini += paso) {
    out.push({
      desde: minutosAFormato(ini),
      hasta: minutosAFormato(ini + paso)
    });
  }
  return out;
}

/**
 * True si un turno que empieza en `desde` y acaba en `hasta` (HH:MM, mismo día)
 * cubre la franja dada. Sin horario, o con `hasta` anterior a `desde`, devuelve
 * false (los turnos nocturnos no se representan franja a franja).
 */
export function turnoCubreFranja(
  desde: string | undefined,
  hasta: string | undefined,
  fr: Franja
): boolean {
  const a = minutosDe(desde ?? "");
  const b = minutosDe(hasta ?? "");
  const i = minutosDe(fr.desde);
  const j = minutosDe(fr.hasta);
  if (a === null || b === null || b <= a || i === null || j === null) return false;
  return i >= a && j <= b;
}
