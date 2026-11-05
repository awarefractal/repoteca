# Repoteca

**A garage for your GitHub repos.** Keep them cataloged, installed, tried out and up to date in one place, instead of scattered all over your disk.

Paste a GitHub URL, and Repoteca indexes it, installs it on demand, runs it so you can try it right away, tells you when it has new commits, and keeps your own notes and demos next to it. Everything is local, with zero dependencies and no database (the catalog is a readable JSON file).

[Español](README.es.md) · License: [MIT](LICENSE) · Needs [Node.js 20+](https://nodejs.org) and [git](https://git-scm.com)

> The web UI is currently in Spanish. The code, API and MCP tools are easy to follow; translations are welcome.

## Quick start

```bash
git clone https://github.com/awarefractal/repoteca.git
cd repoteca
npm start
```

No `npm install` needed: there are no dependencies. On Windows you can also double-click `start.cmd`. The UI opens at `http://localhost:4747` (set `PORT` to change it). It always runs on your own machine.

## What it does

- **Catalog:** paste one or many GitHub URLs. Metadata (description, stars, language, license, topics) comes from the public GitHub API. Add your own category, tags, notes and a verdict (`untested` / `works` / `broken`).
- **Install / Try / Update:** clones the repo and runs its install step, launches it and shows it in a side panel, and updates with `git pull --ff-only`.
- **Check for updates:** compares the local commit with GitHub for the whole catalog.
- **My demo:** your own quick test of each repo, kept outside the clone so updates never overwrite it.
- **Search:** by name, description, category, tag, language or notes.
- **Claude Code / MCP:** the same data is exposed through an MCP server, so you can say "add https://github.com/…", "what do I have about AI?", "install and try X".

## Use it from Claude Code (MCP)

Open this folder in Claude Code: `.mcp.json` registers the `repoteca` server (approve it the first time). From another folder:

```bash
claude mcp add repoteca --scope user -- node /path/to/repoteca/src/mcp.mjs
```

The UI and the MCP server share the same data.

## Where your data lives

One folder, `data/` (git-ignored; move it with the `REPOTECA_DATA` environment variable). To back up or move your catalog to another machine, copy that folder.

| What | Where |
| --- | --- |
| Catalog (readable JSON) | `data/catalog.json` |
| Clones installed by Repoteca | `data/repos/owner__name/` |
| Your demos | `data/demos/owner__name/` |
| Logs and job state | `data/logs/`, `data/jobs/` |

A repo you already cloned elsewhere can be registered **in place** (`installPath` field, via `add_repos` in the MCP). It is never moved or duplicated, and Repoteca never deletes folders it did not install.

## My demo

`data/demos/owner__name/index.html` is served as is. If you need to run something, add a `demo.json`:

```json
{ "run": "node test.js" }
```

The command runs inside the demo folder and receives `REPO_DIR` (the installed repo) and `PORT` (the port to listen on, if it is a server).

## Details

- **How it installs and runs things:** detects Node (`npm|pnpm|yarn`, `dev` or `start` script), Python (`requirements.txt` / `pyproject.toml` in a `.venv`; runs `app.py` / `main.py`), Rust, Go and static HTML. If it guesses wrong, set the commands by hand in the edit dialog. `installCmd: "-"` means "never reinstall".
- **Rate limits:** the GitHub API allows 60 requests/hour without a token. Set `GITHUB_TOKEN` for more, and for private repos.
- **Privacy:** no telemetry. The only network calls are to the GitHub API, to `git` remotes, and to Google Fonts / GitHub avatars when the UI loads in your browser.

## Security

Installing and running **executes third-party code on your machine** (`npm install` scripts, build steps, the repo itself). Review what you install. The server listens only on `127.0.0.1` and rejects requests that do not come from its own UI. Do not expose its port to a network. See [SECURITY.md](SECURITY.md) for details and how to report a vulnerability.

## Contributing

Issues and pull requests are welcome. Keep it dependency-free: the logic lives in `src/core.mjs`, and `server.mjs` (UI) and `mcp.mjs` are thin layers on top of it.

## License

[MIT](LICENSE)
