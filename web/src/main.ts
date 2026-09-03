import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { iniciar } from "./lib/store";

// Siembra los datos de ejemplo y genera las quincenas iniciales.
iniciar();

createApp(App).mount("#app");
