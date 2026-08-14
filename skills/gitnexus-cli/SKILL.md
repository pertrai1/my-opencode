---
name: gitnexus-cli
description: "Use when the user needs to run GitNexus CLI commands like analyze/index a repo, check status, clean the index, generate a wiki, or list indexed repos. Examples: \"Index this repo\", \"Reanalyze the codebase\", \"Generate a wiki\""
---

# GitNexus CLI Commands

Commands below use `node .gitnexus/run.cjs <command>` — the project-local runner `gitnexus analyze` drops next to the index. It auto-selects an available runner at call time (global `gitnexus`, else `pnpm dlx`, else `npx`), so no package-manager assumption and no global install is required.

> **Not analyzed yet, or `node .gitnexus/run.cjs` reports `Cannot find module`** (the gitignored runner is absent — e.g. a fresh clone or `git clean`)? After explicit user approval, (re)generate it from the project root with `npx gitnexus analyze --skip-agents-md --skip-skills`. On **npm 11.x**, if `npx` crashes during install (`node.target is null`), install once with `npm i -g gitnexus` (then `gitnexus analyze --skip-agents-md --skip-skills`) or use `pnpm --allow-build=@ladybugdb/core --allow-build=gitnexus --allow-build=tree-sitter dlx gitnexus@latest analyze --skip-agents-md --skip-skills`. See [#1939](https://github.com/abhigyanpatwari/GitNexus/issues/1939).

## Commands

### analyze — Build or refresh the index

```bash
gitnexus analyze --skip-agents-md --skip-skills
```

Run from the project root after explicit user approval. Before running it, ensure the repo root `.gitignore` contains `/.gitnexus/`, and verify the installed CLI supports both `--skip-agents-md` and `--skip-skills`. This parses all source files and builds the knowledge graph in `.gitnexus/` while avoiding repo-local GitNexus skill installation and agent-file updates.

| Flag           | Effect                                                           |
| -------------- | ---------------------------------------------------------------- |
| `--force`      | Force full re-index even if up to date                           |
| `--embeddings` | Enable embedding generation for semantic search (off by default) |
| `--drop-embeddings` | Drop existing embeddings on rebuild. By default, an `analyze` without `--embeddings` preserves them. |
| `--skip-agents-md` | Skip GitNexus AGENTS.md / CLAUDE.md updates                    |
| `--skip-skills` | Skip repo-local GitNexus skill installation                     |

**When to run:** Only after explicit user approval: first time in a project, after major code changes, or when `gitnexus://repo/{name}/context` reports the index is stale. Do not auto-index or auto-refresh. After indexing, verify the repo is available through the GitNexus MCP and check `git status` for unexpected tracked-file changes. `.gitignore` is the only expected tracked-file modification.

### status — Check index freshness

```bash
node .gitnexus/run.cjs status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

### clean — Delete the index

```bash
node .gitnexus/run.cjs clean
```

Deletes the `.gitnexus/` directory and unregisters the repo from the global registry. Use before re-indexing if the index is corrupt or after removing GitNexus from a project.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt                          |
| `--all`   | Clean all indexed repos, not just the current one |

### wiki — Generate documentation from the graph

```bash
node .gitnexus/run.cjs wiki
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
node .gitnexus/run.cjs list
```

Lists all repositories registered in `~/.gitnexus/registry.json`. The MCP `list_repos` tool provides the same information.

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **Index is stale after re-analyzing**: Restart the MCP host if needed so the server reloads the updated index
- **Embeddings slow**: Omit `--embeddings` (it's off by default) or set `OPENAI_API_KEY` for faster API-based embedding
