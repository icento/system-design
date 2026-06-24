# M0 — Platform spike

Goal: de-risk the load-bearing platform facts **before** building the spine, above
all **fact (a)** — a subagent's *own frontmatter* `PreToolUse` hook fires and can
**deny** that subagent's `Edit`/`Write`. The entire implement-phase enforcement
(M5) rests on this.

## Why this is a manual step

A plugin's subagent-frontmatter hooks (`agents/*.md` → `hooks.PreToolUse`) only load
when the plugin is **installed** into Claude Code. They cannot be exercised by the
generic `Agent` tool, which dispatches by agent *type*, not by an arbitrary file.
So M0 is an **interactive** verification the developer runs once, on the installed
plugin, on their Claude Code version. The artifacts here make it a copy-paste check.

## Facts to confirm

| Fact | What to observe | Pass criterion |
|---|---|---|
| (a) subagent frontmatter PreToolUse denies | spike subagent's Edit on `spike/fixture.txt` | **denied**, reason contains `SPIKE-DENY-OK`; `fixture.txt` still says `UNTOUCHED`; removing the `hooks:` block lets the edit through |
| (b) `${CLAUDE_PLUGIN_ROOT}` resolves in subagent hook | stderr `SPIKE:` lines from `deny.sh` | a real absolute path, not `<unset>` |
| (c) node ≥18.3 on PATH | `node --version` inside subagent | ≥ v18.3 |
| (d) `AskUserQuestion` absent from subagent scope | subagent's tool list | not present (documented confirmation; no runtime assertion needed) |

## Procedure

1. From this plugin dir (already `git init`-ed), copy the two throwaway files into
   the plugin's live tree so Claude Code loads them:
   ```sh
   cp spike/_spike-implementer.md agents/_spike-implementer.md
   cp spike/_spike.md             commands/_spike.md
   chmod +x spike/deny.sh
   ```
2. Install the plugin locally and reload:
   ```
   /plugin marketplace add ./
   /plugin install system-design
   ```
   (During early development before M7 packaging exists, instead point Claude Code
   at this dir as a dev plugin, or run `/agents` and confirm `_spike-implementer`
   shows the `_spike-implementer` agent with a PreToolUse hook.)
3. Run the spike command:
   ```
   /sd:_spike      (or invoke the _spike-implementer agent directly)
   ```
4. Read the report. Apply the pass criteria above.

## Outcome → decision

- **(a) PASS** → proceed with the designed primary channel: the `implementer`
  subagent's own frontmatter `PreToolUse` gate (M5).
- **(a) FAIL** (edit went through) → adopt the **fallback**: run the implementer on
  the **main thread** under the plugin-level `PreToolUse` gate (`pre-edit-protect.sh`),
  which is already proven by the M3 main-thread gate. Note this in `agents/` and skip
  the `agents/implementer.md` frontmatter hook.

## Cleanup

```sh
rm -f agents/_spike-implementer.md commands/_spike.md
```
The `spike/` dir itself never ships (excluded from the plugin via packaging; it is
not referenced by `plugin.json`). Record the result in `CHANGELOG.md` / an ADR once
the corpus exists.
