# Libro de mamá

Un álbum de recuerdos interactivo: un libro que se abre, las fotos una por una con música, y un libro que se cierra al final.

**URL permanente (impresa en el QR):** https://elrecreodeadanzonat-glitch.github.io/

> No cambies el nombre del repositorio ni la ruta pública: el QR impreso apunta a esta URL.
> El sitio es público para quien tenga el enlace (lleva `noindex` para que los buscadores no lo muestren, pero eso no lo hace privado).

## Qué hay aquí

| Carpeta / archivo | Para qué sirve |
|---|---|
| `public/gallery.json` | **Única fuente de verdad** de las fotos: orden, pies de foto, rotación, Encajar/Llenar, punto focal, ocultas. |
| `public/photos/{full,md,thumb}/` | Versiones web de cada foto (≤ 2200 px, ≤ 1280 px para celular y miniaturas). Los originales siguen en Drive. |
| `public/audio/` + `MUSIC_LICENSE.txt` | Música instrumental con licencia verificada (Pixabay Content License). |
| `src/` | La aplicación (React + TypeScript + Vite). `src/admin/` es el editor. |
| `qr/` | El QR fijo (PNG, SVG y versiones para imprimir). `tools/make_qr.py` lo regenera y verifica. |
| `.github/workflows/pages.yml` | Cada cambio en `main` se revisa (lint + pruebas), se construye y se publica solo. |
| `firestore.rules`, `firebase.json` | Reglas de seguridad de la base de datos donde quedan las fotos agregadas con el «+» y los comentarios. |

## Agregar fotos desde el libro (el «+») — sin llaves, para todos

1. En el visor, toca el botón de cuadritos (miniaturas). Al final, después de la última foto, está el **«+ Agregar»**.
2. Elige una o varias fotos del celular o del computador.
3. Toca **«Agregar N fotos al libro»** (el nombre de quien las comparte es opcional y se recuerda en ese aparato).
4. Aparece **«¡Listo!»** → **«Ver mis fotos»**: el libro salta a la primera foto nueva. Todos la ven desde ese momento.

No hace falta cuenta, contraseña ni llave. Si se va el internet a mitad de camino, las que no subieron quedan marcadas y
el botón **«Intentar otra vez»** sube solo esas. Las fotos se reducen a 1600 px como máximo (sin recortes ni retoques).

Estas fotos no van al repositorio: se guardan en la base de datos de la familia (ver «Base de datos» abajo) y el libro
las muestra al final, después de las de `gallery.json`, en el orden en que se agregaron.

## Comentarios en cada foto

Debajo de cada foto hay una burbuja pequeña: **«Comentar»**, o el número de comentarios con el último
(«3 · Rosa: ¡Qué linda!»). Al tocarla se abre la lista de comentarios de esa foto y un cuadro para escribir;
la primera vez se pregunta el nombre y luego se recuerda en ese aparato. Mientras el panel está abierto, el libro no avanza.
Las miniaturas muestran cuántos comentarios tiene cada foto. También se comenta desde el editor (botón de burbuja en
cada tarjeta y en la vista previa).

## Moderación (ocultar, no borrar)

En el editor (`/admin/`):
- Cada tarjeta tiene su botón de comentarios; cada comentario tiene **Ocultar** / **Mostrar de nuevo**.
- La pestaña **De la familia** muestra las fotos agregadas con el «+»: comentarios, **girar**, **Ocultar del libro** / **Mostrar de nuevo**.

Esas acciones piden el **código de moderación** de la familia (12 letras y números), que está en el archivo privado
`Libro de mama - codigo de moderacion.txt` (fuera de este repositorio; no se sube a ningún lado). El editor lo recuerda
solo mientras la pestaña esté abierta. Nada se borra: ocultar es reversible.

## Base de datos (Firebase / Cloud Firestore, plan gratuito)

- Proyecto `libro-de-mama` en la cuenta de Google de la familia. Colecciones: `photos` (datos + miniatura),
  `photoImages` (la foto, ≤ 1 MB), `comments`, y dos privadas (`admin`, `modlog`) que nadie puede leer desde la web.
- La clave `apiKey` de `src/config.ts` **no es un secreto**: solo identifica el proyecto. Lo que cualquiera puede hacer lo
  deciden las reglas de `firestore.rules`, que se aplican en los servidores de Google:
  - cualquiera puede **leer** y **agregar** fotos y comentarios (con límites de tamaño y formato, y la fecha la pone el servidor);
  - nadie puede **editar ni borrar** desde la web;
  - ocultar / mostrar / girar solo con el código de moderación, que viaja en una entrada nueva e ilegible de `modlog`.
- Cambiar las reglas: editar `firestore.rules` y ejecutar `firebase deploy --only firestore:rules` (con `firebase login` en esa cuenta).
- Capacidad del plan gratuito: 1 GB (≈ 2.000 fotos a 1600 px) y 50.000 lecturas al día. El libro pide solo lo nuevo cada 20 s
  mientras está abierto.

## Modo edición — cómo usarlo

Abre **https://elrecreodeadanzonat-glitch.github.io/admin/** (no hay enlace visible desde el libro).

- **Mover una foto:** arrástrala por el asa ⋮⋮, o usa las flechas de la tarjeta (antes/después, al inicio, al final).
- **Agregar fotos (para ordenarlas dentro del libro):** botón **Agregar fotos** → elige una o varias. Se respetan la orientación del celular y las caras; solo se reducen de tamaño y se comprimen (no se usa IA).
- **Quitar / restaurar:** el botón de papelera pide confirmación y manda la foto a la **Papelera** (no se borra ningún archivo). En la pestaña Papelera, **Restaurar**.
- **Rotar**, **Encajar/Llenar**, **punto focal** (lo importante de la foto cuando está en «Llenar») y **pie de foto** en cada tarjeta.
- **Deshacer / Rehacer** (también Ctrl+Z / Ctrl+Y) y **Vista previa** con el visor real.
- Todo se guarda como **borrador en ese dispositivo** (IndexedDB). Nadie más lo ve hasta publicar.

### Publicar cambios (para que todos los vean)

Se necesita una **llave de GitHub** (una sola vez; se puede crear una nueva cuando venza):

1. En GitHub: *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*
   (el editor tiene un enlace directo).
2. *Repository access*: **Only select repositories** → `elrecreodeadanzonat-glitch.github.io`.
3. *Repository permissions*: **Contents → Read and write**. Nada más.
4. Copia la llave y pégala en el editor al pulsar **Publicar cambios**.

La llave se guarda **solo en la memoria de esa pestaña** (no en el navegador, no en el sitio, no en GitHub).
El editor sube las fotos nuevas y `gallery.json` en un solo commit, espera a que el sitio se actualice (1–3 minutos) y muestra **«Libro actualizado»**.
Si alguien publicó desde otro dispositivo mientras tanto, el editor no sobrescribe: pide recargar.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173  (editor en /admin/)
npm run lint
npm test           # pruebas unitarias (Vitest)
npm run build && npx playwright test          # pruebas de interfaz en Chrome (móvil + escritorio)
BASE_URL=https://elrecreodeadanzonat-glitch.github.io npx playwright test   # contra el sitio publicado
```

Las pruebas de interfaz usan una base de datos simulada en memoria (`e2e/fakeFirestore.ts`): nunca escriben en la real.
