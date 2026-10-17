# Custom T3 Code build

`custom/stack` = an upstream nightly release tag + our own commits. Upstream stays untouched; our
changes are a small, rebaseable patch stack.

## Branches

| Branch         | Purpose                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `custom/stack` | nightly tag + custom commits + this `custom/` tooling. Never merge upstream into it; rebase. |
| `fix/*`        | One clean branch per upstream PR, cut from upstream `main`, no `custom/` files.              |

## Update flow (new nightly installed)

1. Update the package (`paru -Syu t3code-nightly-bin`), so `/usr/lib/t3code-nightly` is the new nightly.
2. In the `custom/stack` worktree run `custom/rebuild.sh`.
   It reads the installed version, rebases `custom/stack` onto that release tag, rebuilds the server
   bundle with the same baked-in release config, grafts it into a copy of the installed app at
   `~/apps/t3code-nightly-patched`, and writes the launcher `~/.local/bin/t3code-nightly-custom`.
3. Quit T3 Code and start `t3code-nightly-custom`.

Rebase conflict: resolve it. If upstream merged our fix, drop that commit (`git rebase --skip`).
Then `git push --force-with-lease fork custom/stack` and rerun the script.

## Limits

- Only server-side paths are grafted (see `GRAFTABLE` in `rebuild.sh`). A change to web, desktop,
  mobile or shared contracts makes the script stop; that needs a full desktop build.
- The patched copy does not update itself. After each package update run the script again, or the
  copy keeps running the old nightly.
- Commit with the GitHub noreply address in this repo (`user.email`), not a work address.

## Tracked fixes

| Commits                                                                                        | Problem                                                                                                                                                   | Upstream                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fix(provider-acp): show oneOf/anyOf choices…`, `fix(effect-acp): decode titled multi-select…` | omp's `ask` choices were invisible in T3: the schema generator dropped the `anyOf` property (decode failed) and the adapter mapped only `enum`/`boolean`. | [#19659](https://github.com/pingdotgg/t3code/pull/19659) (fixes #15743) covers the same code. When it merges, `git rebase --skip` these commits. Only our `<id>__other` folding into the choice question's custom answer is not in #19659. |

`fix/acp-elicitation-choices` on the fork holds the same two commits on upstream `main`, unsent
because #19659 duplicates it.
