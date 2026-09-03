<script setup lang="ts">
import Icono from "./Icono.vue";

withDefaults(defineProps<{ titulo: string; ancho?: number }>(), { ancho: 520 });
const emit = defineEmits<{ cerrar: [] }>();
</script>

<template>
  <Teleport to="body">
    <div class="velo" @click.self="emit('cerrar')">
      <div class="modal" :style="{ maxWidth: `${ancho}px`, width: '100%' }" role="dialog" aria-modal="true">
        <div class="modal-cabecera">
          <h2>{{ titulo }}</h2>
          <button class="btn icono-solo" type="button" aria-label="Cerrar" @click="emit('cerrar')">
            <Icono nombre="cerrar" />
          </button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
