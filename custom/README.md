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

## Local read aloud (Linux desktop)

Completed assistant replies have a **Read aloud** action beside Copy. Press it again to stop;
choosing another reply replaces the current playback. Markdown is converted to displayed text.
Playback runs on the desktop machine, including when the thread uses a remote environment.
Web browsers, mobile clients and other desktop platforms do not expose this local-only action.

This customization calls `~/.local/bin/omarchy-read-aloud --stdin --replace`, with reply text on
stdin, never through the clipboard or a shell. The helper must retain its lock while generating
and playing speech, replace any previous playback with `--replace`, and exit nonzero on failure.
The local installation uses only Supertonic 3, preset `F1`, speed `1.20`, via its Python/ONNX CPU runtime at
`~/.local/share/omarchy-tts/supertonic`. Models are downloaded during setup; runtime synthesis
uses `auto_download=False` and makes no cloud request. Greek-containing text uses `el`,
otherwise `en`; mixed sentences remain intact rather than splitting into isolated words.
The helper removes invisible Unicode presentation selectors and formatting controls before
synthesis: Supertonic rejects selectors such as U+FE0F in emoji-bearing replies. Combining
diacritics are preserved so Greek accents are not lost.
Greek input also passes through `~/.local/share/omarchy-tts/spoken_numbers.py`: cardinal
quantities, comma decimals, percentages, euro amounts and times explicitly prefixed by `ώρα`
are verbalized. Technical IDs, dotted versions/IPs, dates and leading-zero IDs remain literal.
English also verbalizes quantities, dot/comma decimals, percentages, euros and times prefixed
by `time`, using `num2words` for English cardinal words. Explicit v-prefixed versions,
IPs, dates, leading-zero IDs and ambiguous comma-thousands stay literal. Digit-only input
selects English. This changes speech input only, not the displayed reply.
The old Kokoro/Piper environments, weights and script-based language splitter were removed.

This patch changes both the web bundle and Electron main/preload, so `rebuild.sh`'s server-only
graft cannot ship it. Build/package both client artifacts against the matching nightly version
and preserve its public relay/Clerk build configuration and native dependencies.
The local speech-enabled copy is `~/apps/t3code-nightly-read-aloud-20261019`;
`~/.local/bin/t3code-nightly-custom` selects it on the next launch. The previous
`~/apps/t3code-nightly-patched` installation is retained.

## Tracked fixes

| Commits                                                                                        | Problem                                                                                                                                                   | Upstream                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fix(provider-acp): show oneOf/anyOf choices…`, `fix(effect-acp): decode titled multi-select…` | omp's `ask` choices were invisible in T3: the schema generator dropped the `anyOf` property (decode failed) and the adapter mapped only `enum`/`boolean`. | [#19659](https://github.com/pingdotgg/t3code/pull/19659) (fixes #15743) covers the same code. When it merges, `git rebase --skip` these commits. Only our `<id>__other` folding into the choice question's custom answer is not in #19659. |

`fix/acp-elicitation-choices` on the fork holds the same two commits on upstream `main`, unsent
because #19659 duplicates it.
