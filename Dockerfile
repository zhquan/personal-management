# Gestor de Personal — web (Tauri + Vue 3). Esta imagen sirve la interfaz web
# para previsualizarla en el navegador; el empaquetado nativo de Windows se hace
# en local con `npm run tauri:build` (necesita Rust + WebView2).
FROM node:22-slim AS build
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /web
COPY --from=build /web/dist ./dist
COPY --from=build /web/node_modules ./node_modules
COPY --from=build /web/package.json ./package.json
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
