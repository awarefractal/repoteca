**[English]** · [(En español más abajo)](#español)

# Security

## What Repoteca does (and why it matters)

Repoteca installs and runs **third-party code on your machine**: `git clone`, then whatever the repo's install/run commands are (`npm install`, `pip install`, `cargo build`, …). Those commands can do anything your user account can do.

- Review a repo before you install or run it.
- Treat the catalog as trusted input: the install/run commands stored in `data/catalog.json` are executed through your shell.
- If you use the MCP server with an AI assistant, repo descriptions and READMEs from GitHub end up in the assistant's context. A malicious repo could try to prompt-inject it. Keep the assistant's permission prompts on for `install_repo`, `run_repo` and `update_installed_repo`.

## What the local server does to protect you

- It listens on `127.0.0.1` only.
- It rejects requests whose `Host` is not `localhost:<port>` / `127.0.0.1:<port>` (DNS rebinding).
- State-changing requests (anything except `GET`) must carry an `Origin` equal to the server's own origin, so other web pages open in your browser cannot drive it.
- Uninstall/remove only deletes clones inside `data/repos`; a repo registered from another folder is never deleted.

Do not expose the port to a network (reverse proxy, tunnel, `0.0.0.0`): the API runs commands.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. Include steps to reproduce and the impact you see. You will get an answer as soon as possible.

---

# Español

# Seguridad

## Qué hace Repoteca (y por qué importa)

Repoteca instala y ejecuta **código de terceros en tu equipo**: `git clone` y luego los comandos de instalación/ejecución del repo (`npm install`, `pip install`, `cargo build`, …). Esos comandos pueden hacer todo lo que puede hacer tu usuario.

- Revisa un repo antes de instalarlo o ejecutarlo.
- Trata el catálogo como una entrada de confianza: los comandos de instalación/ejecución guardados en `data/catalog.json` se ejecutan a través de tu shell.
- Si usas el servidor MCP con un asistente de IA, las descripciones y READMEs de GitHub terminan en el contexto del asistente. Un repo malicioso podría intentar un prompt injection. Mantén activas las confirmaciones de permiso del asistente para `install_repo`, `run_repo` y `update_installed_repo`.

## Qué hace el servidor local para protegerte

- Escucha solo en `127.0.0.1`.
- Rechaza peticiones cuyo `Host` no sea `localhost:<puerto>` / `127.0.0.1:<puerto>` (DNS rebinding).
- Las peticiones que cambian estado (todo salvo `GET`) deben traer un `Origin` igual al del propio servidor, para que otras páginas abiertas en tu navegador no puedan manejarlo.
- Desinstalar/eliminar solo borra clones dentro de `data/repos`; un repo registrado desde otra carpeta nunca se borra.

No expongas el puerto a una red (proxy inverso, túnel, `0.0.0.0`): la API ejecuta comandos.

## Reportar una vulnerabilidad

Por favor **no** abras un issue público. Usa el reporte privado de GitHub: **Security → Report a vulnerability** en este repositorio. Incluye los pasos para reproducirla y el impacto que ves. Recibirás una respuesta lo antes posible.
