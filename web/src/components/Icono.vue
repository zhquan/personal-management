<script setup lang="ts">
// Iconos SVG (trazo fino estilo lucide). Uso: <Icono nombre="personas" />
const props = withDefaults(defineProps<{ nombre: string; tam?: number }>(), { tam: 16 });

const ICONOS: Record<string, string> = {
  // barra lateral
  grafica:
    '<path d="M4 4v16h16"/><path d="M8 16v-4"/><path d="M12 16V8"/><path d="M16 16v-6"/>',
  lupa: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
  personas:
    '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c.6-3.4 3.2-5.4 6.5-5.4s5.9 2 6.5 5.4"/><path d="M15.6 4.8a3.4 3.4 0 0 1 0 6.4"/><path d="M17.8 14.9c1.9.8 3.1 2.4 3.6 5.1"/>',
  calendario:
    '<rect x="3.5" y="5" width="17" height="16" rx="2.6"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
  sol:
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
  ajustes:
    '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h13M21 17h0"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="19" cy="17" r="2"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  // acciones
  mas: '<path d="M12 5v14M5 12h14"/>',
  lapiz: '<path d="M16.8 3.6a2.2 2.2 0 0 1 3.1 3.1L7.6 18 3 19.4 4.4 14.8 16.8 3.6Z"/>',
  papelera:
    '<path d="M4 6.5h16"/><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/><path d="M6.5 6.5 7.6 20a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5l1.1-13.5"/><path d="M10 10.5v6M14 10.5v6"/>',
  flechaIzq: '<path d="M15 5l-7 7 7 7"/>',
  flechaDer: '<path d="M9 5l7 7-7 7"/>',
  flechas: '<path d="M7 5l-4 7 4 7"/><path d="M17 5l4 7-4 7"/><path d="M13 5l-4 14"/>',
  recargar: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/>',
  descargar: '<path d="M12 3.5V15"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 18.5h15"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  alarma: '<circle cx="12" cy="13" r="7.2"/><path d="M12 9.5V13l2.4 1.6"/>',
  puntoInfo: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  corazon: '<path d="M12 20.5S3.5 15.2 3.5 9.3A4.8 4.8 0 0 1 12 6.7a4.8 4.8 0 0 1 8.5 2.6c0 5.9-8.5 11.2-8.5 11.2Z"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 6.9a8 8 0 1 0 11.4 0"/>',
  engranaje:
    '<circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/>'
};

function svgPath(nombre: string): string {
  return ICONOS[nombre] ?? ICONOS.puntoInfo;
}
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="props.tam"
    :height="props.tam"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="svgPath(props.nombre)"
  />
</template>
