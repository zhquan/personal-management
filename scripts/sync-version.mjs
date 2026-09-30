#!/usr/bin/env node
// Propaga la versión del fichero VERSION (fuente única de verdad) al resto de
// ficheros del proyecto:
//   - web/package.json
//   - web/package-lock.json (raíz y paquete "")
//   - web/src-tauri/tauri.conf.json
//   - web/src-tauri/Cargo.toml
//
// Uso (desde cualquier carpeta del repositorio):
//   node scripts/sync-version.mjs
//
// Edita solo la línea de versión de cada fichero (sin reescribirlos), así que
// conserva el formato original. Es idempotente: si todo ya está en la versión
// de VERSION, no toca nada.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = readFileSync(join(raiz, "VERSION"), "utf8").trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`VERSION contiene una versión no válida: "${version}" (se espera x.y.z)`);
  process.exit(1);
}

let cambios = 0;

/** Sustituye la versión en el texto crudo (1 occurrence salvo flag /g). */
const fijarTexto = (rutaRelativa, regex, descripcion) => {
  const ruta = join(raiz, rutaRelativa);
  const texto = readFileSync(ruta, "utf8");
  if (!regex.test(texto)) {
    console.error(`  ✗ ${rutaRelativa}: no se encontró ${descripcion}`);
    process.exitCode = 1;
    return;
  }
  const nuevo = texto.replace(regex, `$1${version}$2`);
  if (nuevo !== texto) {
    writeFileSync(ruta, nuevo);
    console.log(`  ${rutaRelativa} → ${version}`);
    cambios++;
  } else {
    console.log(`  ${rutaRelativa} ya estaba en ${version}`);
  }
};

// package.json y tauri.conf.json: una sola clave "version" en cada uno.
fijarTexto("web/package.json", /^(\s*"version": ")[^"]+(")/m, 'la clave "version"');
fijarTexto("web/src-tauri/tauri.conf.json", /^(\s*"version": ")[^"]+(")/m, 'la clave "version"');

// package-lock.json: la versión aparece en la raíz y en el paquete "" (ambos
// con name "gestor-personal"); las de las dependencias no se tocan. Se admite
// \r?\n porque en Windows el checkout puede traer finales de línea CRLF.
fijarTexto(
  "web/package-lock.json",
  /("name": "gestor-personal",\r?\n\s*"version": ")[^"]+(")/g,
  "la versión raíz y la del paquete"
);

// Cargo.toml: primera línea `version = "..."` (la del paquete; `rust-version`
// es otra clave y no se toca).
fijarTexto("web/src-tauri/Cargo.toml", /^(version\s*=\s*")[^"]+(")/m, "version = …");

if (process.exitCode) {
  console.error("\nNo se pudo propagar la versión en todos los ficheros.");
  process.exit(process.exitCode);
}
console.log(
  cambios > 0
    ? `\nVersión ${version} propagada a ${cambios} fichero(s).`
    : `\nTodos los ficheros ya estaban en la versión ${version}.`
);
