import { jsPDF } from "jspdf";
import { addDays, fmt, inicioSemana, nombreDiaCorto, semanaISO } from "./dates";
import type { Origen } from "./types";

export interface CeldaPdf {
  /** Sigla del turno: "M", "T" o un turno personalizado. */
  turno: string | null;
  clase: "turno" | "descanso" | "cerrado" | "ausencia" | "vacio";
  /** Sigla de ausencia: V, B, A o SJ. */
  sigla?: string;
  /** Color (hex) de un turno personalizado. */
  color?: string;
  /** Turno fijado a mano: borde rojo (empresa) o marrón (intercambio entre empleados). */
  origen?: Exclude<Origen, "auto">;
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
  /** Tipos de turno definidos (base + personalizados) para la leyenda. */
  turnos?: { sigla: string; nombre: string; color: string }[];
}

type RGB = [number, number, number];
const MANANA_FONDO: RGB = [246, 196, 83];
const MANANA_TINTA: RGB = [74, 52, 4];
const TARDE_FONDO: RGB = [174, 205, 245]; // celeste
const TARDE_TINTA: RGB = [43, 58, 171];
const DESC_FONDO: RGB = [238, 240, 246];
const DESC_TINTA: RGB = [151, 160, 181];
const AUS_FONDO: RGB = [247, 239, 239];
const AUS_TINTA: RGB = [120, 90, 90];
const AUS_RAYA: RGB = [206, 172, 172]; // franjas del rayado, visibles incluso sobre la letra
const CERRADO_FONDO: RGB = [244, 245, 249];
const CERRADO_TINTA: RGB = [151, 160, 181];
const CERRADO_RAYA: RGB = [176, 184, 208];
const VACIO_FONDO: RGB = [255, 255, 255];
const EMPRESA: RGB = [220, 38, 38];
const INTERCAMBIO: RGB = [141, 110, 99];

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

  // Reduce la altura de fila si hubiera muchísimos empleados para que entre en una página.
  const maxCuerpo = alto - y0 - 30;
  const factor = Math.min(1, maxCuerpo / Math.max(cuerpoAlto, 1));

  const lineas = (x: number, y: number, w: number, h: number) => {
    doc.setLineWidth(0.2);
    doc.setDrawColor(227, 231, 240);
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
  doc.setTextColor(91, 100, 120);
  doc.text("Empleados", x + 2.5, y + cabAlto1 / 2 + 0.3, { baseline: "middle" });
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

  // ---- Cuerpo: una fila por empleado ----------------------------------------
  y += cabAlto2;
  for (const fila of datos.filas) {
    x = x0;
    const alturaReal = filaAlto * factor;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(227, 231, 240);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colNombre, alturaReal, "FD");

    // nombre (sin bolita de color)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(20, 26, 46);
    doc.text(fila.nombre, x + 2.5, y + alturaReal / 2 + 0.2, { baseline: "middle" });

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
        } else if (celda.turno && celda.color) {
          // Turno personalizado: su color de fondo y letra legible.
          fondo = hexToRgb(celda.color);
          tinta = tintaSobre(celda.color);
          texto = celda.turno;
        }
        negrita = true;
      } else if (celda.clase === "descanso") {
        fondo = DESC_FONDO;
        tinta = DESC_TINTA;
        texto = "—";
      } else if (celda.clase === "cerrado") {
        fondo = CERRADO_FONDO;
        tinta = CERRADO_TINTA;
        texto = "✕";
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
      if (celda.origen) {
        const borde = celda.origen === "empresa" ? EMPRESA : INTERCAMBIO;
        doc.setDrawColor(borde[0], borde[1], borde[2]);
        doc.setLineWidth(0.5);
        doc.rect(x + 0.35, y + 0.35, colDia - 0.7, alturaReal - 0.7);
      }
      if (texto) {
        textoEn(x + colDia / 2, y + alturaReal / 2 + 0.2, texto, "center", tinta, negrita);
      }
      // Ausencias y días cerrados: el rayado se dibuja por encima del fondo y de la letra
      // para que se vea a simple vista que ese día está rayado.
      if (celda.clase === "ausencia") rayado(x, y, colDia, alturaReal, AUS_RAYA);
      else if (celda.clase === "cerrado") rayado(x, y, colDia, alturaReal, CERRADO_RAYA);
      x += colDia;
    }
    y += alturaReal;
  }

  // ---- Separador entre semanas ---------------------------------------------
  // Línea vertical gruesa entre el día 7 y el día 8, de arriba abajo de la
  // tabla (cabecera de semanas + fila de días + cuerpo), para que la semana 1
  // y la semana 2 se distingan de un vistazo.
  const xSep = x0 + colNombre + colDia * 7;
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.9);
  doc.line(xSep, y0, xSep, y);

  // ---- Leyenda + avisos al pie ----------------------------------------------
  y = Math.min(y + 6, alto - 18);
  doc.setFontSize(7.5);
  // leyenda: un bloque por turno definido (Mañana/Tarde solo si siguen activos)
  let lx = x0;
  const turnosDef = datos.turnos && datos.turnos.length
    ? datos.turnos
    : [
        { sigla: "M", nombre: "Mañana", color: "#F6C453" },
        { sigla: "T", nombre: "Tarde", color: "#AECDF5" }
      ];
  // Leyenda solo con texto (sin muestras de color ni cambios de empresa/intercambio;
  // sin Descanso ni Cerrado).
  const leyenda = [...turnosDef.map((t) => `${t.sigla} = ${t.nombre}`), "V/B/A/SJ = Ausencia"];
  doc.setFont("helvetica", "normal");
  doc.setTextColor(91, 100, 120);
  for (const label of leyenda) {
    doc.text(label, lx, y);
    lx += doc.getTextWidth(label) + 12;
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
