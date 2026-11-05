# Repoteca

Catálogo personal de repos de GitHub (ver `README.md`). Este proyecto tiene un servidor MCP (`repoteca`, ver `.mcp.json`): úsalo para operar el catálogo en vez de tocar `data/catalog.json` a mano.

## Cómo trabajar el catálogo

- Si el usuario pega una URL de GitHub (o varias): `add_repos`. Antes mira `list_categories` y reutiliza una categoría existente si encaja; si no, crea una corta y clara. Añade 1–3 tags y, si el usuario dijo por qué le interesa, en `notes`.
- Buscar o recomendar: `list_repos` con `query`/`category`/`status`.
- `install_repo`, `run_repo` y `update_installed_repo` ejecutan código de terceros: solo cuando el usuario lo pida. Tras probar, pregunta si funciona y registra `verdict` con `update_repo`.
- Demo propia: es la prueba del usuario, no se crea sola. Solo cuando lo pida: `create_demo` con `files` (HTML o scripts; `demo.json` con `run` si necesita ejecutar algo) y luego `run_demo` para verla. Vive en `data/demos/`, fuera del clon.
- Un clon ya existente en el disco se registra en su sitio: `add_repos` con `installPath` (y `installCmd: "-"` si no debe reinstalarse).
- `uninstall_repo` borra el clon pero deja el repo en el catálogo; `remove_repo` con `delete_files` / `delete_demo` borra la carpeta instalada y/o la demo propia: confirma antes.
- Al terminar de probar algo, `stop_repo` para no dejar procesos corriendo.

## Código

- Una sola fuente: la lógica vive en `src/core.mjs`; `server.mjs` (UI) y `mcp.mjs` son capas finas encima.
- Sin dependencias ni build. Idioma: español.

## Git

- El autor de todo es el dueño del repo (`awarefractal`). Ningún commit, PR ni archivo lleva líneas `Co-Authored-By` ni «Generated with Claude» ni créditos a Claude.
- Identidad de git de este repo: nombre `awarefractal` y email noreply de GitHub; nunca el email personal.
