<script setup lang="ts">
// Gráfico de barras verticales en SVG puro: una barra por categoría, con el
// valor encima y tooltip nativo al pasar el ratón.
import { computed } from "vue";

interface Barra {
  etiqueta: string;
  valor: number;
  titulo?: string;
}

const props = withDefaults(
  defineProps<{
    barras: Barra[];
    color?: string;
    /** Formato legible de un valor (tooltips y etiqueta superior). */
    formato?: (v: number) => string;
    alto?: number;
  }>(),
  { color: "#4f46e5", formato: (v: number) => String(v), alto: 250 }
);

const ANCHO = 680;
const MARGEN = { izq: 46, der: 16, sup: 22, inf: 34 };

const n = computed(() => props.barras.length);
const anchoPlot = computed(() => ANCHO - MARGEN.izq - MARGEN.der);
const altoPlot = computed(() => props.alto - MARGEN.sup - MARGEN.inf);

function techoAgradable(v: number): number {
  if (v <= 0) return 1;
  const pot = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pot;
  const mult = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return mult * pot;
}

const maxEje = computed(() => {
  let m = 0;
  for (const b of props.barras) if (b.valor > m) m = b.valor;
  return techoAgradable(m);
});

const y = (v: number) => MARGEN.sup + altoPlot.value - (v / maxEje.value) * altoPlot.value;

const TICKS = 5;
const ticks = computed(() =>
  Array.from({ length: TICKS + 1 }, (_, i) => (maxEje.value / TICKS) * i)
);

function formatoEje(v: number): string {
  return Math.round(v).toLocaleString("es-ES");
}

/** Ancho de cada barra (con separación) y su centro X. */
function barraGeom(i: number): { x: number; w: number } {
  const paso = anchoPlot.value / n.value;
  const w = Math.min(52, paso * 0.62);
  return { x: MARGEN.izq + paso * i + (paso - w) / 2, w };
}
</script>

<template>
  <div class="grafico">
    <svg :viewBox="`0 0 ${ANCHO} ${alto}`" class="grafico-svg" role="img" aria-label="Gráfico de barras">
      <!-- cuadrícula y etiquetas del eje Y -->
      <g v-for="t in ticks" :key="t">
        <line :x1="MARGEN.izq" :x2="ANCHO - MARGEN.der" :y1="y(t)" :y2="y(t)" class="rejilla" />
        <text :x="MARGEN.izq - 8" :y="y(t) + 3.5" class="eje-y" text-anchor="end">
          {{ formatoEje(t) }}
        </text>
      </g>
      <!-- barras -->
      <g v-for="(b, i) in barras" :key="b.etiqueta">
        <rect
          :x="barraGeom(i).x"
          :y="y(b.valor)"
          :width="barraGeom(i).w"
          :height="altoPlot - (y(b.valor) - MARGEN.sup)"
          rx="3"
          :fill="color"
          class="barra"
        >
          <title>{{ b.titulo ?? `${b.etiqueta}: ${formato(b.valor)}` }}</title>
        </rect>
        <text
          v-if="b.valor > 0"
          :x="barraGeom(i).x + barraGeom(i).w / 2"
          :y="y(b.valor) - 5"
          class="valor-barra"
          text-anchor="middle"
        >{{ formato(b.valor) }}</text>
        <text
          :x="barraGeom(i).x + barraGeom(i).w / 2"
          :y="alto - 8"
          class="eje-x"
          text-anchor="middle"
        >{{ b.etiqueta }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
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
.barra {
  opacity: 0.9;
  transition: opacity 0.12s;
}
.barra:hover {
  opacity: 1;
}
.valor-barra {
  font-size: 10.5px;
  font-weight: 700;
  fill: var(--subtitulo);
}
</style>