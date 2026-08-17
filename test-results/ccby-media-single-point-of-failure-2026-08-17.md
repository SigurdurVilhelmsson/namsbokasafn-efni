<!-- FROZEN EVIDENCE — banner-dated 2026-08-17. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. Open work belongs in the active register. -->

# 🔴 2,455 CC BY biology media files exist on exactly one disk, and `git clean -fdx` deletes them

Found 2026-08-17 while scoping the CC BY vault. **Independent of the vault decision** — no vault
scope fixes it, because the files are not in git to be vaulted *from*.

## Measured

```
.gitignore:101   books/liffraedi-2e/01-source/media/
.gitignore:100   books/edlisfraedi-2e/01-source/media/
# comment above them: "Local-only source media (large; kept off git for these books)"
```

| book | licence at obtaining | media on disk | media **tracked by git** |
|---|---|---:|---:|
| `efnafraedi-2e` | **CC BY 4.0** | 1,543 | **1,543** ✅ |
| `orverufraedi` | **CC BY 4.0** | 877 | **877** ✅ |
| **`liffraedi-2e`** | **CC BY 4.0** | **2,455** | **0** 🔴 |
| `edlisfraedi-2e` | CC BY-NC-SA 4.0 | 2,088 | 0 ⚠️ |

`git log --all --diff-filter=A` over biology media paths: **0** commits, ever.
**Positive control** in the same sweep: the equivalent query for chemistry media returns non-zero,
and chemistry/microbiology tracked counts equal their on-disk counts exactly — so the zero is a
real absence, not a broken query.

Size: **705 MiB** on disk (`du`); 732,941,964 B counted by file walk.

## Why the two ignored books are NOT the same risk

- **`edlisfraedi-2e` (physics) is CC BY-NC-SA** — the same licence upstream carries **today**.
  Losing it costs a re-download. Annoying, not permanent.
- 🔴 **`liffraedi-2e` (biology) is CC BY 4.0**, obtained 2026-03-11, **before** the 2026-03-19
  upstream relicense. Upstream is CC BY-NC-SA now (re-confirmed live 2026-08-17). **If these 2,455
  files are lost they cannot be re-obtained under CC BY. Ever.** A re-download yields NC-SA bytes
  and silently downgrades the licence basis of every biology derivative that uses an image.

## Why it was invisible

Three separate protections all miss it, each for a defensible reason:

1. **The `.gitignore` decision was about SIZE, not licence.** Its own comment says "large; kept off
   git for these books" — a reasonable call that nobody re-examined after the relicense turned
   these particular bytes irreplaceable. The two ignored books were chosen by weight; one of them
   happened to be CC BY.
2. **The sha256 manifest cannot see it.** `computeFiles` hashes `*.cnxml` only, so media is outside
   every hash gate in the repo — there is nothing to detect a loss against.
3. **The off-box backup does not cover it.** `scripts/backup-db.sh` backs up `sessions.db` and
   nothing else; `books/` leaves the box **solely** via the git remote — and these files are
   excluded from exactly that route.

▶ **So the one category of file that git deliberately does not hold is also the one category the
hash gate does not cover and the off-box backup does not carry.** Three independent mechanisms,
one uncovered intersection.

## What fixes it

An **off-box copy**, which is the [LEAD]'s own proposal of 2026-08-17 (off-site bucket + a portable
package). This finding is not a reason to widen the vault — the vault is an in-repo artifact and
these bytes are deliberately not in the repo. It is a reason the off-box leg is **urgent rather
than prudent**.

⚠️ **Do not "fix" this by removing the `.gitignore` line without a decision.** Committing 705 MiB
into a 4.2 GB `.git` is a real cost paid by every clone forever, and it is a separate call from
getting the bytes off this disk. The two are not the same action.

⚠️ **And it must not ride in on a "yes" to the vault.** Different problem, different fix, its own
[LEAD] decision.
