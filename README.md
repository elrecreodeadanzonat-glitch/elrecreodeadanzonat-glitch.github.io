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

## Agregar fotos desde el libro (el «+»)

En el visor, abre las miniaturas (botón de cuadritos): al final, después de la última foto, está el **«+ Agregar»**.
Eliges fotos del celular o computador, puedes quitar alguna, y luego **Publicar** (pide la llave de GitHub, ver abajo) o **Guardar y seguir en el editor** si prefieres ordenarlas antes.
Al publicar, el libro salta directamente a la primera foto nueva.

## Modo edición — cómo usarlo

Abre **https://elrecreodeadanzonat-glitch.github.io/admin/** (no hay enlace visible desde el libro).

- **Mover una foto:** arrástrala por el asa ⋮⋮, o usa las flechas de la tarjeta (antes/después, al inicio, al final).
- **Agregar fotos:** botón **Agregar fotos** → elige una o varias. Se respetan la orientación del celular y las caras; solo se reducen de tamaño y se comprimen (no se usa IA).
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
