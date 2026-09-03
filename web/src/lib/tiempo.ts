// Utilidades de tiempo recuperable en formato «+2:30» / «-1:00».
// La unidad interna son minutos con signo: negativo = horas extra realizadas;
// positivo = horas que la empleada debe a la empresa.

/** Parsea «+2:30», «-1:00», «2:30» o «0:45» a minutos con signo (null si no es válido). */
export function parsearTiempo(texto: string): number | null {
  const t = texto.trim();
  if (!/^[+-]?\d{1,4}:\d{2}$/.test(t)) return null;
  const signo = t.startsWith("-") ? -1 : 1;
  const cuerpo = t.replace(/^[+-]/, "");
  const [hh, mm] = cuerpo.split(":").map(Number);
  if (mm > 59) return null;
  return signo * (hh * 60 + mm);
}

/** Formatea minutos con signo a «+2:30», «-1:00» o «0:00». */
export function formatearTiempo(minutos: number): string {
  const signo = minutos < 0 ? "-" : minutos > 0 ? "+" : "";
  const abs = Math.abs(minutos);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${signo}${hh}:${String(mm).padStart(2, "0")}`;
}

/** Leyenda textual del signo, para tooltips. */
export function descripcionSaldo(minutos: number): string {
  if (minutos < 0) return "Horas extra realizadas (a favor de la empleada)";
  if (minutos > 0) return "Debe horas a la empresa";
  return "Saldo a cero";
}
