# Gestor de Personal — Calendario de Turnos

Aplicación **nativa ligera para Windows** construida con **Tauri 2 + Vue 3** (interfaz web moderna
sobre WebView2, sin Chromium propio: el ejecutable final pesa unos pocos MB) para gestionar personal
y planificar **turnos automáticos quincenales** con alternancia semana a semana, reajuste automático
de cobertura, **calendario mensual de ausencias con los colores de cada empleado** y
**exportación a PDF**.

## Funcionalidades

- **👥 Plantilla** — CRUD de empleados con **historial de acciones**: un clic en la fila de un
  empleado abre su historial con cada cambio de ficha (alta, baja, salario, contrato…), ausencias
  y apuntes de tiempo recuperable, **ordenado de más reciente a más antiguo** (el lápiz sigue
  abriendo la ficha para editar). La tabla se **ordena con un clic en cualquier cabecera**
  (↑/↓ alterna sentido; las de baja quedan siempre al final). Ficha completa: nombre, DNI/NIE, nº Seguridad Social,
  **teléfono**, **cuenta bancaria (IBAN)**, **fecha de nacimiento**, **color identificativo**,
  **jornada en horas semanales**, **salario bruto mensual**, **tipo de contrato** (por defecto
  *Indefinido*), **días de vacaciones al año (por defecto 30)**, fecha de alta/baja con
  **comentario de la baja** y **notas internas**. La tabla muestra teléfono, contrato, jornada,
  **antigüedad automática** calculada desde la fecha de alta («2 años, 3 meses, 5 días») hasta hoy
  o hasta su baja y **Tiempo Recuperable**: la suma de todos los apuntes (formato `+2:30` /
  `-1:00`); saldo **negativo** = ha hecho horas extra, **positivo** = debe horas a la empresa
  (por defecto `0:00`). Al causar baja la fila queda atenuada.
  - **Vacaciones proporcionales al año de alta**: la columna *Vacaciones {año}* muestra
    `usadas / disponibles`, y los días disponibles se prorratean por días exactos cuando el
    alta (o la baja) ocurre dentro del año en curso — p. ej. alta el 1 de noviembre → 5 días —
    redondeando al día entero más cercano. Desde el 1 de enero del año siguiente vuelve a
    corresponder el año completo (30 por defecto). El tooltip de cada celda explica el cálculo
    y la ficha muestra la vista previa en vivo.
- **🗓️ Calendario de turnos (quincenal)** — Dos semanas en una única tabla con cabecera
  **Semana N · Lunes d · Martes d · Miércoles d · …** y **una fila por empleado**: en cada celda
  una **M** (mañana) o **T** (tarde) pintada de fondo con su color de turno.
  - **Todo el personal disponible queda asignado** a un turno cada día (varios empleados pueden
    compartir turno).
  - **Alternancia semanal**: quien cubre mañana una semana pasa a la tarde la siguiente y
    viceversa (todo el personal alterna; ya no hay disponibilidad fija por turnos).
  - **Reajuste automático**: si un turno se queda sin la cobertura mínima (por vacaciones, bajas
    o descansos de última hora) se mueve personal del otro turno para cubrirlo, sin vaciarlo.
  - **Editable**: clic en una celda → *mañana / tarde / descanso / volver a automático*, con
    **motivo del cambio** (rojo = cambio de la empresa, marrón = intercambio entre empleados) y
    **comentario** opcional. Lo fijado a mano y los descansos («—») se conservan al regenerar.
    El popup de edición se cierra al hacer **clic fuera** de él (o con **Escape**); clicar otra
    celda lo reubica y mantiene abierto para seguir ajustando.
  - Ausencias con su sigla (V / B / A / SJ) y aviso de huecos de cobertura.
  - **Exportar PDF**: botón que descarga la quincena visible (A4 horizontal, colores de turnos y
    de empleados, huecos marcados).
- **🔧 Mantenimiento** — **Exportar base de datos** (descarga un `.json` con todo),
  **Importar base de datos** (sustituye los datos desde una copia exportada, con validación) y
  **copias de seguridad programadas**: frecuencia diaria/semanal/mensual, conservación de las
  últimas N copias (rotación), copia manual, y listado con *Restaurar* y *Eliminar*. La comprobación
  de copias automáticas se hace al abrir la app y cada hora mientras esté abierta.
- **🌴 Vacaciones y ausencias** — **Calendario del mes en curso con flechas ‹ ›** (y botón *Hoy*)
  para navegar. Cada día muestra **el color de cada empleado** que esté de *Vacaciones*, *Baja
  médica*, *Asuntos propios* o *Sin justificar*, con registro/edición/borrado al instante.
  - **Comentario opcional**: al registrar o editar una ausencia (o un apunte de tiempo
    recuperable) se puede añadir un comentario (motivo, justificante…), que queda visible en
    el detalle del día y en la lista del mes.
  - **Tiempo recuperable**: el mismo formulario de registro permite apuntar horas con su signo
    (p. ej. `+2:30` si debe horas o `-1:00` si hizo una hora extra); cada apunte se fecha y
    **aparece en su día dentro del calendario** (pastilla verde con el valor) además de listado
    por mes junto a las ausencias, y su suma se refleja en la columna *Tiempo Recuperable* de
    la Plantilla.
  - **Filtros rápidos**: barra sobre el calendario para filtrar por **empleado** y/o **tipo**
    (Vacaciones, Baja médica, Asuntos propios, Sin justificar, Tiempo recuperable) con botón
    *Aplicar*; el calendario, el detalle del día y las listas laterales muestran solo lo que
    coincide (y *Quitar filtros* lo restaura todo).
  - **Registros editables**: editar una ausencia o un apunte guardado actualiza el registro
    original (fechas, tipo, comentario y valor) sin duplicarlo.

## Requisitos

- **Node.js ≥ 20** (desarrollo y preview web).
- **Windows (para empaquetar el .exe)**: [Rust](https://rustup.rs) (toolchain stable) +
  [WebView2](https://developer.microsoft.com/windows/downloads/windows-10-apps/webview2)
  (viene con Windows 11) y [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/es/visual-cpp-build-tools/).

## Probar en el navegador (cualquier SO)

```bash
cd web
npm install
npm run dev        # abre http://localhost:5173
```

O bien con Docker:

```bash
docker compose up -d --build   # http://localhost:5173
```

## Ejecutar las pruebas y el chequeo de tipos

```bash
cd web
npm test           # vitest (lógica de fechas, planificador y PDF)
npx vue-tsc --noEmit
```

## Empaquetar para Windows (instalador nativo)

El instalador **.exe (NSIS)** se genera en un PC con Windows. Requisitos (una sola vez):

1. **Node.js ≥ 20** → https://nodejs.org
2. **Rust (rustup, toolchain MSVC)** → https://rustup.rs
3. **Visual Studio 2022 Build Tools** con la carga *Desarrollo para escritorio con C++*
   (incluye el compilador MSVC y el SDK de Windows) → https://visualstudio.microsoft.com/es/downloads/
4. **WebView2 Runtime** (ya viene con Windows 11 y con Windows 10 actualizado)

> El CLI de Tauri descarga automáticamente **NSIS** (y **WiX** si también pides el `.msi`), así que
> no hay que instalar nada más. La primera compilación tarda ~10-20 min (compila todas las
dependencias de Rust); las siguientes son rápidas.

### Opción A — con un solo clic

Copia el proyecto a tu PC Windows, abre PowerShell dentro de la carpeta del proyecto y ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File build-windows.ps1
```

Genera `web/src-tauri/target/release/bundle/nsis/…-setup.exe`, abre la carpeta y te la muestra.
Para generar además el `.msi` (WiX): `build-windows.ps1 -Tipo msi`.

### Opción B — a mano

```bash
cd web
npm install
npm run tauri:build                 # .exe NSIS + .msi (WiX)
npm run tauri:build -- --bundles nsis   # solo el instalador .exe
npm run tauri:dev                   # desarrollo con ventana nativa
```

Salida: `web/src-tauri/target/release/bundle/` (subcarpetas `nsis/` y `msi/`).

> El instalador se genera en **español** (NSIS) y usa WebView2 (ya presente en Windows 10/11), así
> que el ejecutable instalado es muy ligero. Al no estar firmado, Windows puede mostrar el aviso
> *«Windows protegió su PC»* la primera vez → *Más información* → *Ejecutar de todas formas*.

## Estructura

```
web/
  src/
    lib/            Lógica de dominio en TypeScript: fechas, planificador, almacén (localStorage), PDF
    views/          VistaPlantilla · VistaCalendario · VistaAusencias (Vue 3)
    components/     Icono, Modal (UI reutilizable)
    styles.css      Sistema de diseño (tema claro, acento índigo, Inter/Segoe)
  src-tauri/        Shell nativo Tauri 2 (Rust) para empaquetar en Windows
  *.test.ts         Pruebas de fechas, planificador y PDF
```

Las fechas se muestran y se escriben siempre en **dd/mm/aaaa** (campos de fecha propios,
independientes del idioma del sistema operativo), aunque internamente se guarden como ISO.

Los datos se guardan en `localStorage` del navegador / WebView2 (persisten entre sesiones).

## Cómo funciona el planificador

Cada quincena (14 días naturales alineados con semanas ISO) el planificador:

1. Decide el **turno semanal** de cada empleado: alternancia respecto a la semana anterior
   (quien estuvo de mañana pasa a tarde y viceversa).
2. Día a día asigna a **todo el personal disponible** su turno semanal; si un turno queda por
   debajo de la cobertura mínima (ausencias, descansos…), se **reajusta** moviendo personal del
   otro turno sin vaciarlo.
3. Respeta **ausencias**, **descansos** fijados a mano y asignaciones manuales; solo marca hueco
   cuando un turno queda sin personal posible.
4. Al **regenerar** se conserva lo manual y solo se recalculan las asignaciones automáticas.
