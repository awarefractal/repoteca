# Repoteca

Tu garage de repos de GitHub: indexados, instalables, probables en el momento, con tu propia demo, al día y buscables. Todo local, sin dependencias y sin base de datos (el catálogo es un JSON).

[English](README.md) · Licencia: [MIT](LICENSE) · Seguridad: [SECURITY.md](SECURITY.md)

## Instalar (desde cero)

Requisitos: [Node.js 20+](https://nodejs.org) y [git](https://git-scm.com).

```bash
git clone https://github.com/<tu-usuario>/repoteca.git
cd repoteca
npm start
```

Sin `npm install`: no tiene dependencias. En Windows también sirve el doble clic a `start.cmd`. Se abre `http://localhost:4747` (otro puerto: variable `PORT`). Corre siempre en tu equipo; para "dejarlo disponible" basta con dejar abierta esa ventana o crear un acceso directo a `start.cmd`.

## Usarla

Pega una o varias URLs de GitHub y Enter. Cada card tiene:

- **Instalar** (clona y corre la instalación), **Probar** (levanta el repo y lo muestra en el panel lateral), **Actualizar** y **Editar** (llave de mecánico: categoría, tags, notas, veredicto, comandos, **Desinstalar** y **Eliminar**; el ícono de terminal abre la telemetría).
- **Mi demo:** tu propia prueba del repo. **Crear demo** arma una carpeta con una plantilla; la editas (o le pides a Claude que la arme) y **Ver demo** la muestra en vivo. Detalles abajo.
- "Buscar actualizaciones" consulta GitHub por cambios en todo el catálogo.

## Usarla desde Claude Code

Abre esta carpeta en Claude Code: `.mcp.json` registra el servidor `repoteca` (apruébalo la primera vez). Luego basta con "agrega https://github.com/…", "qué tengo de IA", "instala y prueba X", "arma mi demo de X". Desde otra carpeta:

```bash
claude mcp add repoteca --scope user -- node /ruta/a/repoteca/src/mcp.mjs
```

La UI y Claude comparten los mismos datos.

## Dónde queda todo

Una sola carpeta, `data/` (ignorada por git; muévela con la variable `REPOTECA_DATA`). Para respaldar o pasar tu catálogo a otro equipo, copia esa carpeta.

| Qué | Dónde |
| --- | --- |
| Catálogo (JSON legible) | `data/catalog.json` |
| Clones instalados por Repoteca | `data/repos/owner__name/` |
| Tus demos | `data/demos/owner__name/` (fuera del clon: actualizar nunca las pisa) |
| Registros y estado de trabajos | `data/logs/`, `data/jobs/` |

Un repo que ya tenías clonado en otra carpeta se registra **en su sitio** (campo `installPath`, vía Claude con `add_repos` + `installPath`): no se mueve ni se duplica, y Repoteca nunca borra carpetas que no instaló.

## Mi demo

`data/demos/owner__name/index.html` se sirve solo. Si necesitas ejecutar algo, agrega `demo.json`:

```json
{ "run": "node prueba.js" }
```

El comando corre en la carpeta de la demo y recibe `REPO_DIR` (el repo instalado) y `PORT` (el puerto donde debe escuchar si es un servidor).

## Detalles

- **Cómo instala/prueba:** detecta Node (`npm|pnpm|yarn`, script `dev` o `start`), Python (`requirements.txt`/`pyproject.toml` en un `.venv`; prueba `app.py`/`main.py`), Rust, Go y HTML estático. Si no acierta, defínelo en Editar. En `installCmd`, `-` significa "no reinstalar nunca".
- **Actualizaciones:** compara el commit local con el de GitHub; "Actualizar" hace `git pull --ff-only` y reinstala.
- **Metadatos:** API pública de GitHub (60 consultas/hora sin token). Define `GITHUB_TOKEN` para más cupo y repos privados.

## Seguridad

Instalar y probar **ejecuta código de terceros en tu equipo** (scripts de `npm install`, etc.). Revisa lo que instalas. El servidor solo escucha en `127.0.0.1` y rechaza peticiones que no vengan de su propia UI.
