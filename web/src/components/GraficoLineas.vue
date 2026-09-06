<script setup lang="ts">
// Gráfico de líneas en SVG puro (sin dependencias): varias series, eje Y con
// cuadrícula, etiquetas de eje X y tooltips nativos al pasar el ratón por los puntos.
import { computed } from "vue";

interface Serie {
  nombre: string;
  color: string;
  valores: (number | null)[];
}

const props = withDefaults(
  defineProps<{
    etiquetas: string[];
    series: Serie[];
    /** Formato legible de un valor (tooltips), p. ej. «1.650 €». */
    formato?: (v: number) => string;
    alto?: number;
  }>(),
  { formato: (v: number) => String(v), alto: 250 }
);

const ANCHO = 680;
const MARGEN = { izq: 52, der: 16, sup: 16, inf: 34 };

const n = computed(() => props.etiquetas.length);
const anchoPlot = computed(() => ANCHO - MARGEN.izq - MARGEN.der);
const altoPlot = computed(() => props.alto - MARGEN.sup - MARGEN.inf);

const hayDatos = computed(() =>
  props.series.some((s) => s.valores.some((v) => v != null))
);

function techoAgradable(v: number): number {
  if (v <= 0) return 1;
  const pot = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pot;
  const mult = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return mult * pot;
}

const maxVal = computed(() => {
  let m = 0;
  for (const s of props.series) for (const v of s.valores) if (v != null && v > m) m = v;
  return m;
});
const maxEje = computed(() => techoAgradable(maxVal.value));

const x = (i: number) =>
  MARGEN.izq + (n.value <= 1 ? anchoPlot.value / 2 : (i / (n.value - 1)) * anchoPlot.value);
const y = (v: number) => MARGEN.sup + altoPlot.value - (v / maxEje.value) * altoPlot.value;

const TICKS = 5;
const ticks = computed(() =>
  Array.from({ length: TICKS + 1 }, (_, i) => (maxEje.value / TICKS) * i)
);

/** Etiquetas del eje Y compactas («1,7 k» en vez de «1650»). */
function formatoEje(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} k`;
  return Math.round(v).toLocaleString("es-ES");
}

const pasoEtiquetas = computed(() => Math.max(1, Math.ceil(n.value / 8)));

interface Punto {
  i: number;
  x: number;
  y: number;
  v: number;
}

function segmentos(s: Serie): { d: string; pts: Punto[] }[] {
  const segs: { d: string; pts: Punto[] }[] = [];
  let pts: Punto[] = [];
  s.valores.forEach((v, i) => {
    if (v == null) {
      if (pts.length) {
        segs.push({ d: pathDe(pts), pts });
        pts = [];
      }
      return;
    }
    pts.push({ i, x: x(i), y: y(v), v });
  });
  if (pts.length) segs.push({ d: pathDe(pts), pts });
  return segs;
}

function pathDe(pts: Punto[]): string {
  return "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L");
}
</script>

<template>
  <div class="grafico">
    <div v-if="!hayDatos" class="grafico-vacio">Sin datos para el rango y filtro seleccionados.</div>
    <svg v-else :viewBox="`0 0 ${ANCHO} ${alto}`" class="grafico-svg" role="img" aria-label="Gráfico de líneas">
      <!-- cuadrícula y etiquetas del eje Y -->
      <g v-for="t in ticks" :key="t">
        <line
          :x1="MARGEN.izq"
          :x2="ANCHO - MARGEN.der"
          :y1="y(t)"
          :y2="y(t)"
          class="rejilla"
        />
        <text :x="MARGEN.izq - 8" :y="y(t) + 3.5" class="eje-y" text-anchor="end">
          {{ formatoEje(t) }}
        </text>
      </g>
      <!-- etiquetas del eje X -->
      <g v-for="(etq, i) in etiquetas" :key="i">
        <text
          v-if="i % pasoEtiquetas === 0 || i === n - 1"
          :x="x(i)"
          :y="alto - 8"
          class="eje-x"
          text-anchor="middle"
        >{{ etq }}</text>
      </g>
      <!-- líneas y puntos de cada serie -->
      <template v-for="s in series" :key="s.nombre">
        <path
          v-for="(seg, si) in segmentos(s)"
          :key="si"
          :d="seg.d"
          :stroke="s.color"
          fill="none"
          class="linea"
        />
        <g v-for="p in segmentos(s).flatMap((seg) => seg.pts)" :key="`${s.nombre}-${p.i}`">
          <circle :cx="p.x" :cy="p.y" r="3.4" :fill="s.color" class="punto">
            <title>{{ s.nombre }} · {{ etiquetas[p.i] }}: {{ formato(p.v) }}</title>
          </circle>
        </g>
      </template>
    </svg>
    <div v-if="hayDatos" class="leyenda">
      <span v-for="s in series" :key="s.nombre" class="leyenda-item">
        <span class="leyenda-muestra" :style="{ background: s.color }"></span>{{ s.nombre }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.grafico {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grafico-svg {
  width: 100%;
  height: auto;
  display: block;
}
.rejilla {
  stroke: var(--borde-suave);
  stroke-width: 1;
}
.eje-y {
  font-size: 10px;
  fill: var(--apagado);
}
.eje-x {
  font-size: 10px;
  fill: var(--apagado);
}
.linea {
  stroke-width: 2.2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.punto {
  stroke: #fff;
  stroke-width: 1.4;
}
.leyenda {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--subtitulo);
  font-weight: 600;
}
.leyenda-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.leyenda-muestra {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.grafico-vacio {
  padding: 46px 20px;
  text-align: center;
  color: var(--apagado);
  font-size: 13px;
}
</style>