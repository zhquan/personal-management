# Gestor de Personal — Calendario de Turnos

Aplicación **nativa ligera para Windows** construida con **Tauri 2 + Vue 3** (interfaz web moderna
sobre WebView2, sin Chromium propio: el ejecutable final pesa unos pocos MB). Funciona también en
cualquier navegador (desarrollo o Docker) con los mismos datos, y sirve para gestionar la plantilla,
planificar **turnos automáticos quincenales**, llevar **vacaciones y ausencias**, hacer una
**planificación por horas** de cada jornada, consultar **estadísticas** de la plantilla, y proteger
todo con **copias de seguridad** y **ajustes de cierre** de la empresa.

La aplicación se organiza en seis secciones (barra lateral): **Dashboard**, **Plantilla**,
**Calendario de turnos**, **Vacaciones y ausencias**, **Mantenimiento** y **Ajustes**.

> Las capturas de esta guía usan **datos ficticios** para mostrar cómo se ve cada sección con
> información de ejemplo.

## 📊 Dashboard

![Dashboard: evolución de la plantilla, salario medio, duración media y edades](docs/screenshots/dashboard.png)

Cuatro visualizaciones (SVG propio, sin dependencias externas) que responden a unos **filtros
generales** comunes:

- **Estado**: Activos / No activos / Todos (por defecto **Activos**), con contador de cada grupo.
- **Rango de fechas**: Desde – Hasta (por defecto el **último año**), con botón *Último año* para
  restablecerlo.

Los gráficos:

1. **Altas vs Bajas vs Actual** — línea de tiempo con las altas y bajas ocurridas cada mes y la
   plantilla al cierre de cada mes dentro del rango.
2. **Salario bruto medio** — línea de tiempo con la media salarial de quien está en plantilla al
   cierre de cada mes.
3. **Duración media** — línea de tiempo con la antigüedad media (en meses) de la plantilla al
   cierre de cada mes.
4. **Empleados por rango de edad** — barras verticales en tramos de 5 años (20–25, 25–30, …),
   con el número sobre cada barra. La edad se calcula a fin del rango (o a día de hoy); quien no
   tiene fecha de nacimiento se cuenta aparte en la nota y no se representa.

Cada punto o barra muestra su valor exacto al pasar el ratón.

## 👥 Plantilla

![Plantilla: listado con buscador, filtro por estado, motivo de baja y columnas ordenables](docs/screenshots/plantilla.png)

- **Filtro por estado**: Activos / No activos / Todos, con contadores (**por defecto Activos**).
- **Buscador único**: un cuadro busca a la vez por **nombre, apellidos, DNI, teléfono y motivo de
  baja**, y se combina (Y) con el filtro de estado.
- **Tabla ordenable**: clic en cualquier cabecera (↑/↓ alterna el sentido). Columnas:
  - **Empleados** — avatar con las iniciales, nombre completo, DNI y estado (activo / baja + fecha).
  - **Teléfono**.
  - **Contrato** — tipo de contrato y jornada en horas semanales.
  - **Antigüedad** — calculada automáticamente desde la fecha de alta («2 años, 3 meses, 5 días»)
    hasta hoy o hasta su baja.
  - **Fecha alta**.
  - **Motivo de baja** — el comentario escrito al causar la baja (hasta dos líneas; el texto
    completo sale al pasar el ratón).
  - **Tiempo Recuperable** — suma de todos los apuntes con su signo (formato `+2:30` / `-1:00`);
    **negativo** = ha hecho horas extra, **positivo** = debe horas a la empresa (por defecto `0:00`).
  - **Vacaciones {año}** — `usadas / disponibles`. Los disponibles se prorratean por días exactos
    cuando el alta (o la baja) cae dentro del año en curso (p. ej. alta el 1 de noviembre → 5 días,
    con 30 anuales), redondeando al día entero más cercano; el tooltip explica el cálculo y la
    ficha muestra la vista previa en vivo. Si en Ajustes los días de cierre semanal *no* cuentan
    como vacaciones, las **usadas** se calculan solo en días laborables (el cierre semanal no gasta
    vacaciones).
  - Los empleados de baja quedan siempre al final del listado y su fila aparece atenuada.
- **Scroll vertical interno** con cabecera fija: si la tabla supera la altura de la ventana, se
  desplaza dentro de su tarjeta en vez de alargar la página.
- **Ficha del empleado** (modal alta/edición), con grupos:
  - *Datos personales*: nombre y apellidos (obligatorios), DNI/NIE, nº Seguridad Social, fecha de
    nacimiento, teléfono, cuenta bancaria (IBAN) y **color identificativo** de una paleta.
  - *Contrato y retribución*: fecha de alta (con la antigüedad en vivo), tipo de contrato (por
    defecto *Indefinido*), jornada en horas semanales, salario bruto mensual y días de vacaciones
    al año (por defecto 30, con vista previa de los que corresponden este año).
  - *Baja laboral* (solo al editar): fecha de baja (vacío = sigue activo) y **comentario de la
    baja**, que se verá en la columna «Motivo de baja».
  - *Notas internas*.
- **Historial de acciones por empleado**: clic en una fila abre el historial completo (más reciente
  primero) con cada acción registrada: altas, bajas, cambios de ficha, ausencias y apuntes de
  tiempo (añadidos, modificados y eliminados). Los cambios de ficha se muestran **campo a campo con
  el valor anterior tachado → el nuevo** (p. ej. *salario bruto: ~~1500~~ → 1600*). Desde el
  historial se puede saltar a *Editar ficha*.

## 🗓️ Calendario de turnos

Planificación **quincenal** (14 días) alineada a la semana laboral configurada en Ajustes (por
defecto lunes a domingo). Un filtro por estado —**Activos / No activos / Todos**, por defecto
Activos— decide qué empleados se muestran: quien tiene fecha de baja sigue contando como activo
mientras la quincena visible incluya la semana de su último día, y pasa a *No activos* después.
Los días en que la empresa está cerrada aparecen con una **✕** y no se programa a nadie.

![Calendario de turnos: quincena con vista Simple, cierres semanales y cambios fijados a mano](docs/screenshots/calendario-turnos.png)

Hay dos vistas (pestañas **Simple** / **Avanzada**); la Avanzada solo aparece si está activada en
Ajustes.

### Vista Simple

- Una tabla con **una fila por empleado** y una columna por día, con cabecera *Semana N* sobre cada
  grupo de días y un **separador más marcado entre la semana 1 y la semana 2**.
- Cada celda muestra la sigla del turno (M / T / sigla personalizada) con **el color de fondo de su
  tipo de turno**; el día de hoy se resalta con un contorno verde alrededor de su columna entera.
- La columna Empleados se ensancha automáticamente para que el **nombre completo salga en una sola
  línea** (con margen), mientras todos los días conservan exactamente el mismo ancho.
- Leyenda bajo el título: tipos de turno definidos, Descanso, Ausencia (rayada), Cerrado, Hoy,
  Cambiado por la empresa y Cambio entre empleados.

**Editar a mano**: clic en una celda abre el editor con:

- El **turno** (Mañana, Tarde, un turno personalizado o Descanso).
- El **motivo del cambio**: *Cambio de la empresa* (borde/letra en rojo) o *Cambio entre empleados*
  (marrón); lo automático no lleva marca.
- Un **comentario** opcional (motivo, observaciones…).

También hay *Volver a automático* para quitar lo fijado y dejar que el planificador decida. El
popup se cierra al hacer clic fuera o con *Escape*. Todo lo fijado a mano y los descansos se
**conservan al regenerar**; un clic en *Regenerar* recalcula solo la parte automática.

**Cobertura**: si algún turno se queda sin personal un día (vacaciones, bajas, descansos de última
hora), aparece un aviso con los huecos. Las ausencias se marcan con su sigla (V / B / A / SJ).

### Vista Avanzada (plan por horas)

Una planificación **independiente del calendario M/T** (el planificador automático no la toca):

- **Cada columna es un día** de la quincena visible y **cada fila, una franja horaria** de la
  duración configurada en Ajustes (por defecto 30 min dentro de 06:00–22:00), en **formato de 24 h**
  (p. ej. `06:00`, `06:30`, …, `21:30`).
- Dentro de cada día cada empleado ocupa un **carril vertical**: clic en una celda libre para
  añadir a un empleado con su **Desde – Hasta** (hay atajos con los horarios de los turnos M/T o
  personalizados definidos). Cada empleado se pinta con su color identificativo y puede tener
  **varios tramos el mismo día** sin acoplarse (p. ej. 09:00–11:00 y 14:00–18:00).
- Clic en un tramo ocupado permite **quitarlo** de ese día. Los días cerrados no se pueden
  planificar.

### Exportar a PDF

El botón *Exportar PDF* descarga la quincena visible en **A4 horizontal**:

- Celdas de turno con su color de fondo y sigla (incluidos los turnos personalizados con su color).
- **Ausencias y días cerrados con la celda rayada** (rayado diagonal grueso, visible por encima de
  la letra); los cambios a mano solo se marcan con el borde (rojo empresa / marrón intercambio).
- Columna de empleados con el nombre, sin bolita de color, y un **separador vertical marcado entre
  las dos semanas**.
- Leyenda al pie con **siglas de texto** (M = Mañana, T = Tarde, turnos personalizados y
  V/B/A/SJ = Ausencia), los avisos de cobertura y el estado final.

## 🌴 Vacaciones y ausencias

![Vacaciones y ausencias: calendario mensual con filtros de empleado, tipo y estado](docs/screenshots/vacaciones-ausencias.png)

- **Calendario del mes** con flechas ‹ › y botón *Hoy*. Cada día muestra una pastilla por empleado
  con su color y nombre (o el valor en el caso del tiempo recuperable); si hay más de tres apuntes
  aparece «+N más».
- **Filtros**: barra con **Empleado · Tipo · Estado** y botones *Aplicar* / *Quitar filtros*:
  - *Empleado* — el desplegable se adapta al estado elegido (bajo «Activos» solo salen los que
    siguen trabajando; bajo «Todos», toda la plantilla).
  - *Tipo* — Vacaciones, Baja médica, Asuntos propios, Sin justificar o Tiempo recuperable.
  - *Estado* — Activos / No activos / Todos (por defecto **Activos**).
  - El calendario, el detalle del día y las listas laterales muestran solo lo que coincide con los
    filtros aplicados.
- **Registrar / editar ausencia**: empleado (solo activos; al editar un registro de alguien ya de
  baja se incluye esa persona para no dejar el formulario vacío), tipo, *Desde* / *Hasta* y
  comentario opcional. Para el tipo **Vacaciones**, una nota muestra en vivo cuántos días contará
  el período según el ajuste de Ajustes: *naturales* (con «Sí») o *laborables*, descontando los
  días de cierre semanal (con «No»).
- **Tiempo recuperable**: se registra con fecha y un **valor con signo** (`-1:00` = hizo una hora
  extra, `+2:30` = debe horas), con comentario opcional. Cada apunte aparece en su día del
  calendario (pastilla verde con el valor) y su suma se refleja en la columna *Tiempo Recuperable*
  de la Plantilla.
- **Detalle del día**: clic en un día del calendario muestra todas sus ausencias y apuntes, con
  editar / eliminar.
- **Panel lateral**: dos bloques desplegables con las *Ausencias* y el *Tiempo recuperable* del mes
  visible, también editables desde ahí.

## 🔧 Mantenimiento

![Mantenimiento: exportar e importar, plan de copias automáticas y copias guardadas](docs/screenshots/mantenimiento.png)

- **Exportar base de datos** y **Importar base de datos**, en la misma fila: la exportación
  descarga un `.json` con todos los datos (para guardarlo en una unidad, la nube, etc.); la
  importación sustituye los datos actuales por los del archivo elegido, con validación.
- **Planificar copias de seguridad**: activar las copias automáticas, elegir la **frecuencia**
  (cada día / semana / mes) y cuántas **conservar** (rotación de las últimas N). La comprobación se
  hace al abrir la aplicación y cada hora mientras esté abierta. También hay botón *Hacer copia
  ahora*.
- **Copias guardadas**: listado (con scroll propio si se acumulan) donde cada copia muestra su
  fecha y hora, un resumen (empleados, ausencias, apuntes y tamaño) y las acciones
  **Restaurar** / **Eliminar**.

## ⚙️ Ajustes

![Ajustes: cierres semanales, períodos de cierre, vista Avanzada y tipos de turno](docs/screenshots/ajustes.png)

### Días de cierre semanales

Botones L · M · X · J · V · S · D para marcar los días de la semana en que la empresa permanece
cerrada (p. ej. todos los martes): no se generan turnos y el calendario los marca con ✕. Dentro de
esta tarjeta hay además:

- **¿Los días de cierre semanal cuentan como vacaciones?** — Sí / No (por defecto **Sí**). Con
  «Sí», un período del lunes al domingo con cierre el martes cuenta **7 días naturales**; con «No»,
  **6 días laborables** (el martes no gasta vacaciones). Afecta al resumen al registrar una
  ausencia y a la columna de vacaciones de la Plantilla.
- **Inicio y fin de semana (Calendario de turnos)** — dos selectores para elegir el día en que
  **empieza** y en que **termina** la semana del Calendario de turnos (por defecto lunes → domingo).
  Si el martes es día de cierre semanal, se puede poner la semana de **miércoles a lunes**: el
  martes deja de aparecer en el Calendario de turnos y la quincena se re-alinea a ese inicio.

### Períodos de cierre

Rangos de fechas en que la empresa cierra (p. ej. vacaciones de la empresa del 03/08 al 25/08).
Se listan con sus fechas (marcando *en curso* si el período incluye hoy), se pueden quitar y añadir
nuevos con *Desde* / *Hasta*.

### Vista Avanzada del calendario

Botón **Activar / Desactivar**. Al activarla se despliega el formulario de configuración:

- Hora de la **primera** y de la **última** franja.
- **Duración de cada franja en HH:MM** (editable; p. ej. `00:15`, `00:30` o `01:00`; debe dividir
  el rango en franjas completas).

Al desactivarla, la vista desaparece de «Calendario de turnos» y su configuración queda oculta,
pero la planificación por horas guardada se conserva.

### Tipos de turno

- **Mañana (M)** y **Tarde (T)** vienen por defecto con sus colores y horario
  (06:00–14:00 / 14:00–22:00). Son fijos pero **también se pueden borrar** (dejan de programarse y
  sus asignaciones a mano se quitan); un botón permite *Restaurar Mañana y Tarde*. Al editarlos
  solo se puede cambiar su horario.
- **Añadir turnos personalizados**: una **sigla de un carácter** (letra, número o carácter
  especial, p. ej. `N`, `2` o `@`), un nombre, un **color** a elección y, opcionalmente, un
  **horario** (turno «por hora», desde–hasta). Si se marca **automático**, el turno entra en la
  rotación semanal junto a M y T; si no, solo se asigna a mano.
- La lista de turnos crece en columnas y, si hay muchos, tiene **scroll interno** para que la
  página no se alargue sin fin.

Al pie de la página se avisa si la empresa está cerrada hoy o si hay un cierre próximo.

## Dónde se guardan los datos

Todo se guarda en el **almacenamiento local** de la aplicación (no hay servidor):

- En el navegador (Docker / `npm run dev`) → en el `localStorage` de ese navegador para esa
  dirección.
- En la aplicación de Windows → en el almacenamiento de WebView2 del perfil de la app
  (`%LOCALAPPDATA%\com.gestorpersonal.app\EBWebView\…`), propio de cada usuario del equipo.

Los datos persisten entre sesiones; para sacar una copia fuera de la aplicación, la vía recomendada
es **Mantenimiento → Exportar base de datos** (un único `.json` legible). Las **copias de
seguridad programadas** también viven en ese mismo almacenamiento interno, y se gestionan
(Restaurar / Eliminar) desde la propia aplicación.

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
npm test           # vitest (fechas, planificador, tiempo, dashboard, almacén y PDF)
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
> dependencias de Rust); las siguientes son rápidas.

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

### Opción C — con GitHub Actions

El repositorio incluye un workflow (`.github/workflows/build-windows.yml`) que compila el
instalador automáticamente en un runner de Windows. **No se publica una Release por cada
push**: solo cuando el último commit del push empieza por **«Release x.y.z»** (p. ej.
`Release 0.1.0`).

- **Cada push a `main`** → compila el instalador y lo sube como artefacto
  (`instalador-windows`), sin publicar ninguna *Release*.
- **Publicar una versión** — haz un push a `main` cuyo último commit tenga el mensaje
  `Release x.y.z`. El workflow entonces:
  1. fija la versión `x.y.z` en los archivos del proyecto (commit automático `build: versión`),
  2. crea y sube la etiqueta **`vx.y.z`**,
  3. compila el instalador `Personal-Management_x.y.z_…-setup.exe`,
  4. publica la *Release* **`vx.y.z`** con un **resumen de los cambios desde la última
     release** —nuevas funcionalidades, arreglos, eliminaciones y otros cambios—,
     agrupados automáticamente por el tipo del mensaje de cada commit (`feat:`, `fix:`,
     `remove:`/`delete:`, etc.).
- **Manual** (pestaña *Actions* → *Run workflow*) → compila y sube solo el artefacto.

> El instalador se genera en **español** (NSIS) y usa WebView2 (ya presente en Windows 10/11), así
> que el ejecutable instalado es muy ligero. Al no estar firmado, Windows puede mostrar el aviso
> *«Windows protegió su PC»* la primera vez → *Más información* → *Ejecutar de todas formas*.

## Estructura

```
web/
  src/
    lib/            Lógica de dominio en TypeScript: fechas, horarios, planificador,
                    almacén (localStorage), dashboard y PDF
    views/          VistaDashboard · VistaPlantilla · VistaCalendario · VistaAusencias
                    · VistaMantenimiento · VistaAjustes (Vue 3)
    components/     Icono, Modal, CampoFecha, GraficoLineas, GraficoBarras (UI reutilizable)
    styles.css      Sistema de diseño (tema claro, acento índigo, Inter/Segoe)
  src-tauri/        Shell nativo Tauri 2 (Rust) para empaquetar en Windows
  *.test.ts         Pruebas de fechas, planificador, tiempo, dashboard, almacén y PDF
```

Las fechas se muestran y se escriben siempre en **dd/mm/aaaa** (campos de fecha propios,
independientes del idioma del sistema operativo), aunque internamente se guarden como ISO. Las
horas del calendario avanzado se muestran en **formato de 24 h**.

## Cómo funciona el planificador

Cada quincena (14 días alineados con la semana laboral configurada, por defecto semanas ISO) el
planificador:

1. Decide el **turno semanal** de cada empleado por rotación respecto a la semana anterior
   (quien estuvo de mañana pasa al siguiente turno de la rotación, y así con los turnos
   personalizados marcados como **automáticos**; si Mañana o Tarde se han borrado, no entran).
2. Día a día asigna a **todo el personal disponible** su turno semanal; si un turno queda por debajo
   de la cobertura mínima (ausencias, descansos…), se **reajusta** moviendo personal de otro turno
   con excedente, sin vaciarlo del mínimo.
3. Respeta **ausencias**, **días de cierre de la empresa** (semanal o por período), **descansos**
   fijados a mano y **asignaciones manuales**; solo marca un hueco cuando un turno queda sin
   personal posible.
4. Al **regenerar** se conserva lo manual y solo se recalculan las asignaciones automáticas.
