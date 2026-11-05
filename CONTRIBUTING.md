**[English]** · [(En español más abajo)](#español)

# Contributing to Repoteca

Thanks for wanting to help! Issues and pull requests are welcome. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the idea before you spend time on it.
- **Security problems:** do not open a public issue. Use **Security → Report a vulnerability** on this repository (see [SECURITY.md](SECURITY.md)).
- **Conduct problems:** open an issue titled "Conduct report" with no details and ask for a private channel; the maintainer will arrange one.

## Ground rules

- **No dependencies and no build step.** Plain Node.js 20+ and plain browser JavaScript.
- **One source of truth:** the logic lives in `src/core.mjs`. `src/server.mjs` (web UI API) and `src/mcp.mjs` (MCP server) are thin layers on top of it.
- **Keep the server safe:** it listens only on `127.0.0.1` and checks `Host` and `Origin`. Anything that runs commands must stay behind those checks. Escape every piece of third-party text you put in the UI (`esc()` in `public/app.js`).
- **Language:** the UI is currently in Spanish. Translations and an English UI are welcome, ideally switchable instead of replacing the Spanish one. Documentation is English first with Spanish below.
- **Racing theme, no official assets:** use generic motorsport vocabulary only. No Formula 1 / FIA logos, wordmarks, fonts, photos, or team and driver names.
- **Third-party material** must be MIT/BSD/Apache-compatible and credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Try your changes

```bash
git clone https://github.com/awarefractal/repoteca.git
cd repoteca
REPOTECA_DATA=/tmp/repoteca-dev npm start
```

Use a throwaway `REPOTECA_DATA` folder so your real catalog is never touched. On Windows PowerShell: `$env:REPOTECA_DATA = "$env:TEMP\repoteca-dev"; npm start`. Keep that path short: very deep folders break `git clone` on Windows.

Before opening a pull request:

```bash
for f in src/*.mjs test/*.mjs public/*.js; do node --check "$f"; done
npm test
```

The tests (`node --test`, no dependencies) cover the URL parser, the block on adding Repoteca to itself, and the server's `Host` / `Origin` checks. They use a throwaway data folder, never your real `data/`. The CI runs the same two steps.

## Pull requests

- Branch from `main`, keep the change focused, and describe what and why.
- Screenshots must use sample data (for example repos owned by organizations), never your personal catalog, paths or avatars of private people.
- Your commits publish the email in your git config. Use your GitHub `noreply` address if you want to keep it private.
- By contributing you agree that your work is released under the project's [MIT license](LICENSE).
- The maintainer reviews every pull request; the CI check must pass.

---

# Español

# Contribuir a Repoteca

¡Gracias por querer ayudar! Los issues y pull requests son bienvenidos. Lee antes el [Código de Conducta](CODE_OF_CONDUCT.md).

## Antes de empezar

- Para algo más grande que un arreglo pequeño, abre primero un issue y acordemos la idea antes de que gastes tiempo.
- **Problemas de seguridad:** no abras un issue público. Usa **Security → Report a vulnerability** en este repositorio (ver [SECURITY.md](SECURITY.md)).
- **Problemas de conducta:** abre un issue titulado "Conduct report" sin detalles y pide un canal privado; el administrador lo coordinará.

## Reglas básicas

- **Sin dependencias y sin paso de build.** Node.js 20+ y JavaScript de navegador sin más.
- **Una sola fuente:** la lógica vive en `src/core.mjs`. `src/server.mjs` (API de la UI web) y `src/mcp.mjs` (servidor MCP) son capas finas encima.
- **Mantén el servidor seguro:** escucha solo en `127.0.0.1` y comprueba `Host` y `Origin`. Todo lo que ejecute comandos debe seguir detrás de esas comprobaciones. Escapa cada texto de terceros que muestres en la UI (`esc()` en `public/app.js`).
- **Idioma:** la UI está hoy en español. Las traducciones y una UI en inglés son bienvenidas, idealmente conmutables y sin reemplazar el español. La documentación va primero en inglés y debajo en español.
- **Tema de carreras, sin material oficial:** usa solo vocabulario genérico del automovilismo. Nada de logos, marcas denominativas, tipografías o fotos de la Fórmula 1 o la FIA, ni nombres de equipos o pilotos.
- **Material de terceros:** debe ser compatible con MIT/BSD/Apache y tener su crédito en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Probar tus cambios

```bash
git clone https://github.com/awarefractal/repoteca.git
cd repoteca
REPOTECA_DATA=/tmp/repoteca-dev npm start
```

Usa una carpeta `REPOTECA_DATA` desechable para no tocar nunca tu catálogo real. En PowerShell de Windows: `$env:REPOTECA_DATA = "$env:TEMP\repoteca-dev"; npm start`. Mantén esa ruta corta: las carpetas muy profundas rompen `git clone` en Windows.

Antes de abrir un pull request:

```bash
for f in src/*.mjs test/*.mjs public/*.js; do node --check "$f"; done
npm test
```

Los tests (`node --test`, sin dependencias) cubren el parser de URLs, el bloqueo de agregar Repoteca a sí misma y las comprobaciones de `Host` / `Origin` del servidor. Usan una carpeta de datos desechable, nunca tu `data/` real. El CI corre estos mismos dos pasos.

## Pull requests

- Parte de `main`, mantén el cambio acotado y describe qué y por qué.
- Las capturas deben usar datos de ejemplo (por ejemplo repos de organizaciones), nunca tu catálogo personal, rutas ni avatares de personas privadas.
- Tus commits publican el email de tu configuración de git. Usa tu dirección `noreply` de GitHub si quieres mantenerlo privado.
- Al contribuir aceptas que tu trabajo se publique bajo la [licencia MIT](LICENSE) del proyecto.
- El administrador revisa cada pull request; el check del CI debe pasar.
