import { jsPDF } from "jspdf";
import { addDays, fmt, nombreDiaCorto, semanaISO } from "./dates";
import type { Fecha } from "./types";

export interface CeldaPdf {
  /** Sigla del turno: "M", "T" o un turno personalizado. */
  turno: string | null;
  clase: "turno" | "descanso" | "cerrado" | "ausencia" | "vacio";
  /** Sigla de ausencia: V, B, A o SJ. */
  sigla?: string;
  /** Color (hex) de un turno personalizado. */
  color?: string;
  /** Varios turnos el mismo día (jornadas partidas): se pintan apilados. */
  turnosDia?: { turno: string; color?: string; desde?: string; hasta?: string }[];
}

export interface FilaPdf {
  nombre: string;
  color: string;
  celdas: CeldaPdf[];
}

export interface PdfCalendario {
  inicio: string; // día de inicio de la quincena (alineado a la semana laboral)
  filas: FilaPdf[];
  /** Días visibles de la quincena (por defecto los 14 naturales). */
  dias?: Fecha[];
  /** Cuántos días visibles pertenecen a la primera semana (por defecto 7). */
  diasSemana1?: number;
  titulo?: string;
  empresa?: string;
  avisos?: string[];
  /** Tipos de turno definidos (base + personalizados) para la leyenda y las horas en celda. */
  turnos?: { sigla: string; nombre: string; color: string; desde?: string; hasta?: string }[];
}

type RGB = [number, number, number];
const DESC_FONDO: RGB = [238, 240, 246];
const AUS_RAYA: RGB = [206, 172, 172]; // franjas del rayado, visibles incluso sobre la letra
const CERRADO_RAYA: RGB = [176, 184, 208];
const VACIO_FONDO: RGB = [255, 255, 255];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

/** Color de texto legible (claro u oscuro) sobre un fondo hex. */
function tintaSobre(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? [31, 36, 48] : [255, 255, 255];
}

export function construirPdfCalendario(datos: PdfCalendario): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const MARGEN = 12;

  // ---- Cabecera -----------------------------------------------------------
  const ini = datos.inicio;
  // Días visibles: los de la semana laboral configurada; por defecto, los 14.
  const diasArr = datos.dias ?? Array.from({ length: 14 }, (_, i) => addDays(ini, i));
  const nDias = diasArr.length;
  const nSem1 = datos.diasSemana1 ?? 7;
  const fin = diasArr[nDias - 1];
  const semana1 = semanaISO(ini);
  const semana2 = semanaISO(addDays(ini, 7));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 26, 46);
  doc.text(datos.titulo ?? "Calendario de turnos", MARGEN, 14);
  // Negro uniforme para todo el texto y todos los contornos.
  const TINTA: RGB = [20, 26, 46];
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(91, 100, 120);
  doc.text(`Del ${fmt(ini)} al ${fmt(fin)}`, MARGEN, 19.5);

  // ---- Cálculo de geometría de la tabla ------------------------------------
  // Filas bien altas para que sigla y horas se lean incluso con varios turnos.
  const filaAlto = 12;
  const cabAlto1 = 7;
  const cabAlto2 = 7;
  const x0 = MARGEN;
  const y0 = 27;
  const colNombre = 52;
  const resto = ancho - MARGEN * 2 - colNombre;
  const colDia = resto / nDias;
  const cuerpoAlto = datos.filas.length * filaAlto;

  // Reduce la altura de fila si hubiera muchísimos empleados para que entre en una página.
  const maxCuerpo = alto - y0 - 30;
  const factor = Math.min(1, maxCuerpo / Math.max(cuerpoAlto, 1));

  const lineas = (x: number, y: number, w: number, h: number) => {
    doc.setLineWidth(0.2);
    doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.rect(x, y, w, h);
  };

  // Rayado diagonal a 45° que cubre la celda entera (se dibuja solo el tramo
  // dentro de la celda; sin clip, que jsPDF no aplica bien a varias líneas),
  // más grueso y oscuro que en pantalla para que se note a simple vista.
  const rayado = (x: number, y: number, w: number, h: number, color: RGB, paso = 2.6, grosor = 0.5) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(grosor);
    for (let c = -h - paso; c <= w + paso; c += paso) {
      const x1 = Math.max(0, -c);
      const x2 = Math.min(w, h - c);
      if (x2 > x1) doc.line(x + x1, y + x1 + c, x + x2, y + x2 + c);
    }
  };

  const textoEn = (x: number, y: number, t: string, alineacion: "left" | "center" | "right" = "left", tinta?: RGB, negrita = false) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setTextColor(...(tinta ?? [20, 26, 46]));
    doc.text(t, x, y, { align: alineacion, baseline: "middle" });
  };

  // ---- Fila 1: nombres de semana (esquina + 2 bloques de 7) ----------------
  let y = y0;
  let x = x0;
  lineas(x, y, colNombre, cabAlto1);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20, 26, 46);
  doc.text("Empleados", x + 2.5, y + cabAlto1 / 2 + 0.3, { baseline: "middle" });
  x += colNombre;

  // Bloques de semana solo cuando el período visible las incluye ambas
  // (con 1 semana visible no se dibuja el bloque de la semana siguiente).
  const bloquesSemana: [string | number, number][] = [];
  if (nDias - nSem1 > 0) {
    bloquesSemana.push([semana1, colDia * nSem1]);
    bloquesSemana.push([semana2, colDia * (nDias - nSem1)]);
  } else {
    bloquesSemana.push([semana1, colDia * nDias]);
  }
  for (const [sem, wBloque] of bloquesSemana) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.setLineWidth(0.2);
    doc.rect(x, y, wBloque, cabAlto1, "FD");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 26, 46);
    doc.text(`Semana ${sem}`, x + wBloque / 2, y + cabAlto1 / 2 + 0.3, { align: "center", baseline: "middle" });
    x += wBloque;
  }

  // ---- Fila 2: días ---------------------------------------------------------
  y += cabAlto1;
  x = x0 + colNombre;
  for (let i = 0; i < nDias; i++) {
    const fecha = diasArr[i];
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colDia, cabAlto2, "FD");
    const num = Number(fecha.slice(8));
    // Fechas siempre en negro para que se lean bien (también en impresión B/N).
    textoEn(x + colDia / 2, y + 2.6, String(num), "center", [20, 26, 46], true);
    textoEn(x + colDia / 2, y + 5.4, nombreDiaCorto(fecha).slice(0, 3), "center", [20, 26, 46], false);
    x += colDia;
  }

  // Horario y nombre de cada turno definido (para las celdas de turno).
  const horasPorSigla = new Map<string, { desde: string; hasta: string }>();
  const nombresPorSigla = new Map<string, string>();
  for (const t of datos.turnos ?? []) {
    if (t.desde && t.hasta) horasPorSigla.set(t.sigla, { desde: t.desde, hasta: t.hasta });
    nombresPorSigla.set(t.sigla, t.nombre || t.sigla);
  }
  const nombreDe = (sigla: string) => nombresPorSigla.get(sigla) ?? sigla;

  // ---- Cuerpo: una fila por empleado ----------------------------------------
  y += cabAlto2;
  for (const fila of datos.filas) {
    x = x0;
    const alturaReal = filaAlto * factor;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colNombre, alturaReal, "FD");

    // nombre (sin bolita de color)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(20, 26, 46);
    doc.text(fila.nombre, x + 2.5, y + alturaReal / 2 + 0.2, { baseline: "middle" });

    x += colNombre;
    for (const celda of fila.celdas) {
      // Todas las celdas sin color de fondo y todo el texto en negro: el
      // contenido se distingue por su símbolo y, si procede, por el rayado.
      let texto = "";
      let negrita = false;
      // Sub-bloques cuando el empleado tiene varios turnos el mismo día.
      const multi = celda.turnosDia && celda.turnosDia.length > 1 ? celda.turnosDia : undefined;
      if (celda.clase === "turno") {
        texto = celda.turno ? nombreDe(celda.turno) : "";
        negrita = true;
      } else if (celda.clase === "descanso") {
        texto = "—";
      } else if (celda.clase === "cerrado") {
        texto = "✕";
      } else if (celda.clase === "ausencia") {
        texto = celda.sigla ?? "A";
        negrita = true;
      }
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
      doc.setLineWidth(0.2);
      doc.rect(x, y, colDia, alturaReal, "FD");
      // Varios turnos el mismo día: sub-bloques apilados (solo las horas).
      if (multi) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        const h = alturaReal / multi.length;
        multi.forEach((sub, i) => {
          const sy = y + i * h;
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
          doc.setLineWidth(0.2);
          doc.rect(x, sy, colDia, h, "FD");
          doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
          // Nombre del turno arriba y horas debajo dentro de cada sub-bloque.
          doc.setFontSize(6);
          doc.text(nombreDe(sub.turno), x + colDia / 2, sy + h * 0.34 + 0.2, { align: "center", baseline: "middle" });
          if (sub.desde && sub.hasta) {
            const tamPrevio = doc.getFontSize();
            doc.setFont("helvetica", "normal");
            doc.setFontSize(5);
            const horasSub = `${sub.desde}–${sub.hasta}`;
            if (doc.getTextWidth(horasSub) <= colDia - 0.8) {
              doc.text(horasSub, x + colDia / 2, sy + h * 0.74 + 0.2, { align: "center", baseline: "middle" });
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(tamPrevio);
          }
        });
      }
      // Con varios turnos los sub-bloques ya pintaron sus horas: no repetir
      // aquí las del turno principal (parecía un turno extra duplicado).
      if (texto && !multi) {
        // Turnos: nombre del turno arriba y horas debajo (si tiene horario);
        // descanso/cerrado/ausencia: su símbolo centrado.
        const info = celda.clase === "turno" && celda.turno ? horasPorSigla.get(celda.turno) : undefined;
        if (celda.clase === "turno" && info && alturaReal >= 6.5) {
          doc.setFontSize(6.5);
          textoEn(x + colDia / 2, y + alturaReal * 0.36, texto, "center", TINTA, negrita);
          const horas = `${info.desde}–${info.hasta}`;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.2);
          if (doc.getTextWidth(horas) <= colDia - 1.2) {
            doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
            doc.text(horas, x + colDia / 2, y + alturaReal * 0.74, { align: "center", baseline: "middle" });
          }
        } else if (celda.clase !== "turno") {
          // Turnos sin horario definido: celda en blanco (sin horas no hay nada
          // que leer). Descanso/cerrado/ausencia sí muestran su símbolo.
          doc.setFontSize(9);
          textoEn(x + colDia / 2, y + alturaReal / 2 + 0.2, texto, "center", TINTA, negrita);
        }
      }
      // Ausencias y días cerrados: el rayado se dibuja por encima del fondo y de la letra
      // para que se vea a simple vista que ese día está rayado.
      if (celda.clase === "ausencia") rayado(x, y, colDia, alturaReal, AUS_RAYA);
      else if (celda.clase === "cerrado") rayado(x, y, colDia, alturaReal, CERRADO_RAYA);
      x += colDia;
    }
    y += alturaReal;
  }

  // ---- Avisos al pie (sin leyenda) ------------------------------------------
  y = Math.min(y + 5, alto - 20);
  if (datos.avisos && datos.avisos.length > 0) {
    let n = Math.min(3, datos.avisos.length);
    const maxW = ancho - MARGEN * 2;
    let avisoTxt = datos.avisos.slice(0, n).join("   ·   ");
    while (n > 1 && doc.getTextWidth(avisoTxt) > maxW) {
      n--;
      avisoTxt = datos.avisos.slice(0, n).join("   ·   ");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.text(avisoTxt, ancho - MARGEN, y, { align: "right" });
  }
  // pie
  doc.setFontSize(7);
  doc.setTextColor(151, 160, 181);
  doc.text(`Generado con Gestor de Personal · ${fmt(ini)} — ${fmt(fin)}`, MARGEN, alto - 5);
  doc.text(String(datos.avisos?.length ? `${datos.avisos.length} aviso(s) de cobertura` : "Cobertura completa"), ancho - MARGEN, alto - 5, { align: "right" });

  return doc;
}

export function exportarCalendarioPdf(datos: PdfCalendario) {
  const doc = construirPdfCalendario(datos);
  const semana1 = semanaISO(datos.inicio);
  const nombreArchivo = `turnos-semana${semana1}-${datos.inicio}.pdf`;
  doc.save(nombreArchivo);
}

// ============================================================== Plan por horas
// (vista Avanzada del calendario: columnas = días, filas = franjas de 30 min)

/** Un empleado trabajando en una franja de un día (un tramo del plan). */
export interface CarrilPdfPlan {
  nombre: string;
  /** Color (hex) del empleado, como en la vista. */
  color: string;
  /** Tramo asignado; puede cubrir varias franjas. */
  desde: string;
  hasta: string;
}

/** Celda del plan por horas: lo que ocurre en un día en una franja. */
export interface CeldaPdfPlan {
  /** Día cerrado (empresa): se pinta rayado como en la vista Simple. */
  cerrado: boolean;
  /** Empleados que trabajan en la franja, en el orden de sus carriles. */
  empleados: CarrilPdfPlan[];
}

export interface PdfPlanHoras {
  /** Día de inicio de la quincena (alineado a la semana laboral). */
  inicio: string;
  /** Días visibles de la quincena (los de la semana laboral configurada). */
  dias: Fecha[];
  /** Cuántos días visibles pertenecen a la primera semana (por defecto 7). */
  diasSemana1?: number;
  /** Franjas horarias de las filas, en orden. */
  franjas: { desde: string; hasta: string }[];
  /** Una fila por franja (mismo orden que `franjas`), una celda por día. */
  celdas: CeldaPdfPlan[][];
  /** Duración de cada franja en minutos (solo para el pie). */
  duracionFranjaMin?: number;
  titulo?: string;
}

/** Iniciales del nombre (primera letra de nombre y primer apellido). */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export function construirPdfPlanHoras(datos: PdfPlanHoras): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const MARGEN = 12;

  const diasArr = datos.dias;
  const nDias = diasArr.length;
  const nSem1 = datos.diasSemana1 ?? 7;
  const fin = diasArr[nDias - 1] ?? datos.inicio;
  const semana1 = semanaISO(datos.inicio);
  const semana2 = semanaISO(addDays(datos.inicio, 7));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 26, 46);
  doc.text(datos.titulo ?? "Plan de turnos por horas", MARGEN, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(91, 100, 120);
  doc.text(`Del ${fmt(datos.inicio)} al ${fmt(fin)}`, MARGEN, 19);

  // ---- Geometría de la tabla ------------------------------------------------
  const x0 = MARGEN;
  const y0 = 25;
  const colHora = 24;
  const colDia = nDias ? (ancho - MARGEN * 2 - colHora) / nDias : 0;
  const cabDiaAlto = 9;
  const nFilas = datos.franjas.length;
  const disponible = alto - y0 - cabDiaAlto - 14;
  const filaH = nFilas ? Math.min(8, Math.max(2.4, disponible / nFilas)) : 0;

  const bordes = () => {
    doc.setDrawColor(227, 231, 240);
    doc.setLineWidth(0.2);
  };
  const rayado = (x: number, y: number, w: number, h: number, color: RGB, paso = 2.6, grosor = 0.5) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(grosor);
    for (let c = -h - paso; c <= w + paso; c += paso) {
      const x1 = Math.max(0, -c);
      const x2 = Math.min(w, h - c);
      if (x2 > x1) doc.line(x + x1, y + x1 + c, x + x2, y + x2 + c);
    }
  };
  const textoEn = (t: string, x: number, y: number, alineacion: "left" | "center" | "right", tinta: RGB, tam: number, negrita = false) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(tinta[0], tinta[1], tinta[2]);
    doc.text(t, x, y, { align: alineacion, baseline: "middle" });
  };

  // ---- Cabecera de días ------------------------------------------------------
  let y = y0;
  bordes();
  doc.setFillColor(248, 249, 253);
  doc.rect(x0, y, colHora, cabDiaAlto, "FD");
  textoEn("Horas", x0 + colHora / 2, y + cabDiaAlto / 2, "center", [91, 100, 120], 7.5, true);
  let x = x0 + colHora;
  for (let i = 0; i < nDias; i++) {
    const fecha = diasArr[i];
    const cerrado = datos.celdas[0]?.[i]?.cerrado ?? false;
    const domingo = nombreDiaCorto(fecha) === "domingo";
    doc.setFillColor(cerrado ? 244 : domingo ? 253 : 248, cerrado ? 245 : domingo ? 244 : 249, cerrado ? 249 : domingo ? 247 : 253);
    bordes();
    doc.rect(x, y, colDia, cabDiaAlto, "FD");
    const num = Number(fecha.slice(8));
    textoEn(String(num), x + colDia / 2, y + 3.1, "center", domingo ? [220, 38, 38] : [91, 100, 120], 8, true);
    textoEn(cerrado ? `${nombreDiaCorto(fecha).slice(0, 3)} ✕` : nombreDiaCorto(fecha).slice(0, 3), x + colDia / 2, y + 6.6, "center", cerrado ? [120, 90, 90] : [151, 160, 181], 6.5);
    x += colDia;
  }

  // ---- Cuerpo: una fila por franja -------------------------------------------
  y += cabDiaAlto;
  const tablaTop = y;
  for (let f = 0; f < nFilas; f++) {
    const fr = datos.franjas[f];
    const filaCeldas = datos.celdas[f] ?? [];
    x = x0;
    // Columna de horas
    const alterna = f % 2 === 1;
    doc.setFillColor(alterna ? 247 : 255, alterna ? 248 : 255, alterna ? 252 : 255);
    bordes();
    doc.rect(x, y, colHora, filaH, "FD");
    textoEn(`${fr.desde}–${fr.hasta}`, x + colHora - 1.8, y + filaH / 2, "right", [91, 100, 120], 5.6);
    x += colHora;
    // Celdas de días
    for (let i = 0; i < nDias; i++) {
      const celda = filaCeldas[i] ?? { cerrado: false, empleados: [] };
      const base: RGB = celda.cerrado ? [244, 245, 249] : alterna ? [247, 248, 252] : VACIO_FONDO;
      doc.setFillColor(base[0], base[1], base[2]);
      bordes();
      doc.rect(x, y, colDia, filaH, "FD");
      if (celda.cerrado) {
        rayado(x, y, colDia, filaH, CERRADO_RAYA);
      } else if (celda.empleados.length) {
        // Un carril horizontal por empleado, como en la vista.
        const k = celda.empleados.length;
        const hueco = colDia / k;
        const bandW = hueco - 0.8;
        const bandH = filaH - 0.8;
        for (let j = 0; j < k; j++) {
          const emp = celda.empleados[j];
          const bx = x + j * hueco + 0.4;
          const by = y + 0.4;
          const rgb = hexToRgb(emp.color);
          doc.setFillColor(rgb[0], rgb[1], rgb[2]);
          doc.rect(bx, by, Math.max(bandW, 0.6), Math.max(bandH, 0.6), "F");
          const cx = bx + bandW / 2;
          const cy = by + bandH / 2;
          if (bandW >= 5.5 && bandH >= 3.4) {
            const tinta = tintaSobre(emp.color);
            textoEn(iniciales(emp.nombre), cx, cy, "center", tinta, 5, true);
            if (bandW >= 11 && bandH >= 6.4) {
              textoEn(`${emp.desde}–${emp.hasta}`, cx, cy + 2.4, "center", tinta, 4);
            }
          }
        }
      }
      x += colDia;
    }
    y += filaH;
  }

  // ---- Separador entre semanas -----------------------------------------------
  if (nDias > nSem1) {
    const xSep = x0 + colHora + colDia * nSem1;
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.9);
    doc.line(xSep, y0, xSep, y);
  }

  // ---- Leyenda de empleados ---------------------------------------------------
  const vistos = new Map<string, string>();
  for (const filaCeldas of datos.celdas) {
    for (const celda of filaCeldas) {
      for (const emp of celda.empleados) if (!vistos.has(emp.nombre)) vistos.set(emp.nombre, emp.color);
    }
  }
  y = Math.min(y + 5, alto - 12);
  if (vistos.size) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    let lx = x0;
    for (const [nombre, color] of vistos) {
      const rgb = hexToRgb(color);
      const wTexto = doc.getTextWidth(nombre);
      if (lx + 3.4 + wTexto > ancho - MARGEN) {
        lx = x0;
        y += 3.4;
        if (y > alto - 10) break; // sin sitio: se corta la leyenda
      }
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.rect(lx, y - 1.9, 2.6, 2.6, "F");
      doc.setTextColor(91, 100, 120);
      doc.text(nombre, lx + 3.4, y);
      lx += 3.4 + wTexto + 5;
    }
  }

  // ---- Pie ---------------------------------------------------------------------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(151, 160, 181);
  doc.text(`Generado con Gestor de Personal · ${fmt(datos.inicio)} — ${fmt(fin)}`, MARGEN, alto - 5);
  const dur = datos.duracionFranjaMin;
  doc.text(`${nFilas} franja${nFilas === 1 ? "" : "s"}${dur ? ` de ${dur} min` : ""}`, ancho - MARGEN, alto - 5, { align: "right" });

  return doc;
}

export function exportarPdfPlanHoras(datos: PdfPlanHoras) {
  const doc = construirPdfPlanHoras(datos);
  const semana1 = semanaISO(datos.inicio);
  const nombreArchivo = `plan-horas-semana${semana1}-${datos.inicio}.pdf`;
  doc.save(nombreArchivo);
}
