import { jsPDF } from "jspdf";
import { addDays, fmt, inicioSemana, nombreDiaCorto, semanaISO } from "./dates";

export interface CeldaPdf {
  /** "M" | "T" | null */
  turno: "M" | "T" | null;
  clase: "turno" | "descanso" | "ausencia" | "vacio";
  /** Sigla de ausencia: V, B, A o SJ. */
  sigla?: string;
  manual?: boolean;
}

export interface FilaPdf {
  nombre: string;
  color: string;
  celdas: CeldaPdf[];
}

export interface PdfCalendario {
  inicio: string; // lunes de la quincena
  filas: FilaPdf[];
  titulo?: string;
  empresa?: string;
  avisos?: string[];
}

type RGB = [number, number, number];
const MANANA_FONDO: RGB = [246, 196, 83];
const MANANA_TINTA: RGB = [74, 52, 4];
const TARDE_FONDO: RGB = [59, 75, 216];
const TARDE_TINTA: RGB = [255, 255, 255];
const DESC_FONDO: RGB = [238, 240, 246];
const DESC_TINTA: RGB = [151, 160, 181];
const AUS_FONDO: RGB = [247, 239, 239];
const AUS_TINTA: RGB = [120, 90, 90];
const VACIO_FONDO: RGB = [255, 255, 255];
const ACENTO: RGB = [79, 70, 229];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

export function construirPdfCalendario(datos: PdfCalendario): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const MARGEN = 12;

  // ---- Cabecera -----------------------------------------------------------
  const ini = datos.inicio;
  const fin = addDays(ini, 13);
  const semana1 = semanaISO(ini);
  const semana2 = semanaISO(inicioSemana(fin));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 26, 46);
  doc.text(datos.titulo ?? "Calendario de turnos", MARGEN, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(91, 100, 120);
  doc.text(`Del ${fmt(ini)} al ${fmt(fin)}`, MARGEN, 19.5);

  // ---- Cálculo de geometría de la tabla ------------------------------------
  const filaAlto = 7.2;
  const cabAlto1 = 7;
  const cabAlto2 = 7;
  const x0 = MARGEN;
  const y0 = 27;
  const colNombre = 52;
  const resto = ancho - MARGEN * 2 - colNombre;
  const colDia = resto / 14;
  const cuerpoAlto = datos.filas.length * filaAlto;

  // Reduce la altura de fila si hubiera muchísimas empleadas para que entre en una página.
  const maxCuerpo = alto - y0 - 30;
  const factor = Math.min(1, maxCuerpo / Math.max(cuerpoAlto, 1));

  const lineas = (x: number, y: number, w: number, h: number) => {
    doc.setLineWidth(0.2);
    doc.setDrawColor(227, 231, 240);
    doc.rect(x, y, w, h);
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
  doc.setTextColor(91, 100, 120);
  doc.text("Empleada", x + 2.5, y + cabAlto1 / 2 + 0.3, { baseline: "middle" });
  x += colNombre;

  for (const sem of [semana1, semana2]) {
    const wBloque = colDia * 7;
    doc.setFillColor(238, 240, 255);
    doc.setDrawColor(227, 231, 240);
    doc.setLineWidth(0.2);
    doc.rect(x, y, wBloque, cabAlto1, "FD");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text(`Semana ${sem}`, x + wBloque / 2, y + cabAlto1 / 2 + 0.3, { align: "center", baseline: "middle" });
    x += wBloque;
  }

  // ---- Fila 2: días ---------------------------------------------------------
  y += cabAlto1;
  x = x0 + colNombre;
  for (let i = 0; i < 14; i++) {
    const fecha = addDays(ini, i);
    const domingo = nombreDiaCorto(fecha) === "domingo";
    doc.setFillColor(domingo ? 253 : 248, domingo ? 244 : 249, domingo ? 247 : 253);
    doc.setDrawColor(227, 231, 240);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colDia, cabAlto2, "FD");
    const num = Number(fecha.slice(8));
    textoEn(x + colDia / 2, y + 2.6, String(num), "center", domingo ? [220, 38, 38] : [91, 100, 120], true);
    textoEn(x + colDia / 2, y + 5.4, nombreDiaCorto(fecha).slice(0, 3), "center", [151, 160, 181], false);
    x += colDia;
  }

  // ---- Cuerpo: una fila por empleada ----------------------------------------
  y += cabAlto2;
  for (const fila of datos.filas) {
    x = x0;
    const alturaReal = filaAlto * factor;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(227, 231, 240);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colNombre, alturaReal, "FD");

    // bolita de color + nombre
    const [cr, cg, cb] = hexToRgb(fila.color);
    doc.setFillColor(cr, cg, cb);
    doc.circle(x + 4, y + alturaReal / 2, 1.7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(20, 26, 46);
    doc.text(fila.nombre, x + 7.5, y + alturaReal / 2 + 0.2, { baseline: "middle" });

    x += colNombre;
    for (const celda of fila.celdas) {
      let fondo: RGB = VACIO_FONDO;
      let tinta: RGB = [20, 26, 46];
      let texto = "";
      let negrita = false;
      if (celda.clase === "turno") {
        if (celda.turno === "M") {
          fondo = MANANA_FONDO;
          tinta = MANANA_TINTA;
          texto = "M";
        } else if (celda.turno === "T") {
          fondo = TARDE_FONDO;
          tinta = TARDE_TINTA;
          texto = "T";
        }
        negrita = true;
      } else if (celda.clase === "descanso") {
        fondo = DESC_FONDO;
        tinta = DESC_TINTA;
        texto = "—";
      } else if (celda.clase === "ausencia") {
        fondo = AUS_FONDO;
        tinta = AUS_TINTA;
        texto = celda.sigla ?? "A";
        negrita = true;
      }
      doc.setFillColor(fondo[0], fondo[1], fondo[2]);
      doc.setDrawColor(227, 231, 240);
      doc.setLineWidth(0.2);
      doc.rect(x, y, colDia, alturaReal, "FD");
      if (celda.manual) {
        doc.setDrawColor(ACENTO[0], ACENTO[1], ACENTO[2]);
        doc.setLineWidth(0.5);
        doc.rect(x + 0.35, y + 0.35, colDia - 0.7, alturaReal - 0.7);
      }
      if (texto) {
        textoEn(x + colDia / 2, y + alturaReal / 2 + 0.2, texto, "center", tinta, negrita);
      }
      x += colDia;
    }
    y += alturaReal;
  }

  // ---- Leyenda + avisos al pie ----------------------------------------------
  y = Math.min(y + 6, alto - 18);
  doc.setFontSize(7.5);
  // leyenda
  let lx = x0;
  const leyenda: { label: string; fill: RGB; tinta: RGB }[] = [
    { label: "M = Mañana", fill: MANANA_FONDO, tinta: MANANA_TINTA },
    { label: "T = Tarde", fill: TARDE_FONDO, tinta: TARDE_TINTA },
    { label: "— = Descanso", fill: DESC_FONDO, tinta: DESC_TINTA },
    { label: "V/B/A = Ausencia", fill: AUS_FONDO, tinta: AUS_TINTA }
  ];
  for (const item of leyenda) {
    doc.setFillColor(item.fill[0], item.fill[1], item.fill[2]);
    doc.rect(lx, y - 1.4, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(91, 100, 120);
    doc.text(item.label, lx + 5.2, y);
    lx += doc.getTextWidth(item.label) + 12;
  }
  // avisos
  if (datos.avisos && datos.avisos.length > 0) {
    doc.setTextColor(150, 100, 8);
    const avisoTxt = datos.avisos.slice(0, 3).join("   ·   ");
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
