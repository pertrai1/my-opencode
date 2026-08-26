---
name: gitnexus-cli
description: "Use when the user needs to run GitNexus CLI commands like analyze/index a repo, check status, clean the index, generate a wiki, or list indexed repos. Examples: \"Index this repo\", \"Reanalyze the codebase\", \"Generate a wiki\""
---

# GitNexus CLI Commands

Commands below prefer the direct `gitnexus <command>` CLI. Some installations may also create a project-local `node .gitnexus/run.cjs <command>` wrapper, but that file is not guaranteed to exist, so do not assume it is present.

> **Not analyzed yet, or a project-local wrapper like `node .gitnexus/run.cjs` reports `Cannot find module`**? Do not assume the wrapper should exist. First try the direct CLI from the repo root. After explicit user approval, add `/.gitnexus/` to the repo root `.gitignore` if needed, confirm `gitnexus analyze --help` supports the flags you plan to use, then prefer:
>
> - `gitnexus analyze --skip-agents-md` to build the index without touching `AGENTS.md` / `CLAUDE.md`
> - `gitnexus analyze` only when you explicitly want GitNexus to update `AGENTS.md` / `CLAUDE.md`
> - `gitnexus analyze --skills` only when you explicitly want repo-specific skills generated under `.claude/skills/generated/`
>
> On **npm 11.x**, if `npx` crashes during install (`node.target is null`), install once with `npm i -g gitnexus` or use `pnpm --allow-build=@ladybugdb/core --allow-build=gitnexus --allow-build=tree-sitter dlx gitnexus@latest analyze`. See [#1939](https://github.com/abhigyanpatwari/GitNexus/issues/1939).

## Commands

### analyze — Build or refresh the index

```bash
gitnexus analyze --skip-agents-md
```

Run from the project root after explicit user approval. Before running it, ensure the repo root `.gitignore` contains `/.gitnexus/`, and verify the installed CLI supports the flags you plan to use. The default for this repo is `gitnexus analyze --skip-agents-md` so indexing does not modify `AGENTS.md` or `CLAUDE.md`.

| Flag           | Effect                                                           |
| -------------- | ---------------------------------------------------------------- |
| `--force`      | Force full re-index even if up to date                           |
| `--embeddings` | Enable embedding generation for semantic search (off by default) |
| `--skip-agents-md` | Skip GitNexus AGENTS.md / CLAUDE.md updates                    |
| `--skills`     | Generate repo-specific skills under `.claude/skills/generated/` |

**When to run:** Only after explicit user approval: first time in a project, after major code changes, or when `gitnexus://repo/{name}/context` reports the index is stale. Do not auto-index or auto-refresh. In this repo, prefer `--skip-agents-md` and do not use `--skills` unless the user explicitly requests generated skills. After indexing, verify the repo is available through the GitNexus MCP and check `git status` for unexpected tracked-file changes. `.gitignore` is the only expected tracked-file modification.

### analyze with instruction file updates

```bash
gitnexus analyze
```

Use this only when you explicitly want GitNexus to create or update the repo's `AGENTS.md` and `CLAUDE.md` GitNexus sections.

### analyze with generated skills

```bash
gitnexus analyze --skills
```

Use this only when you explicitly want GitNexus to generate repo-specific skill files from detected communities. On this machine, that writes files under `.claude/skills/generated/`.

### analyze without instruction file updates

```bash
gitnexus analyze --skip-agents-md
```

This is the default for this repo. Use it unless the user explicitly wants GitNexus to update `AGENTS.md` / `CLAUDE.md`.

### status — Check index freshness

```bash
gitnexus status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

### clean — Delete the index

```bash
gitnexus clean
```

Deletes the `.gitnexus/` directory and unregisters the repo from the global registry. Use before re-indexing if the index is corrupt or after removing GitNexus from a project.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt                          |
| `--all`   | Clean all indexed repos, not just the current one |

### wiki — Generate documentation from the graph

```bash
gitnexus wiki
```

Generates repository documentation from the knowledge graph using an LLM. Requires an API key (saved to `~/.gitnexus/config.json` on first use).

| Flag                | Effect                                    |
| ------------------- | ----------------------------------------- |
| `--force`           | Force full regeneration                   |
| `--model <model>`   | LLM model (default: minimax/minimax-m2.5) |
| `--base-url <url>`  | LLM API base URL                          |
| `--api-key <key>`   | LLM API key                               |
| `--concurrency <n>` | Parallel LLM calls (default: 3)           |
| `--gist`            | Publish wiki as a public GitHub Gist      |

### list — Show all indexed repos

```bash
gitnexus list
```

Lists all repositories registered in `~/.gitnexus/registry.json`. The MCP `list_repos` tool provides the same information.

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Multi-Repo Note

If multiple repositories are indexed globally, `gitnexus query`, `gitnexus context`, and `gitnexus impact` need an explicit `--repo <name>` argument. If you omit it, the CLI fails with a "Multiple repositories indexed" error.

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **"Multiple repositories indexed"**: Re-run with `--repo <name>`
- **`node .gitnexus/run.cjs` missing**: Use direct `gitnexus ...` commands instead of assuming the wrapper exists
- **Index is stale after re-analyzing**: Restart the MCP host if needed so the server reloads the updated index
- **Embeddings slow**: Omit `--embeddings` (it's off by default) or set `OPENAI_API_KEY` for faster API-based embedding
