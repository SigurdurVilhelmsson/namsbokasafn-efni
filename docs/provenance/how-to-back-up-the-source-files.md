# How to back up the source files (CNXML + images) — a manual, one-off procedure

**Audience:** you, at the keyboard, with basic Linux skills. No project tooling is involved and none
should be built. This is a deliberate one-off act, not a pipeline stage.

**What it protects:** `books/*/01-source/` — the OpenStax CNXML and images this whole project is
derived from. Three of the five books were obtained while OpenStax published them under **CC BY
4.0**; OpenStax relicensed to **CC BY-NC-SA** on 2026-03-19, and a Creative Commons licence is
**irrevocable for the copy you already hold**. So these particular bytes carry a grant that **cannot
be re-obtained by downloading them again**. Full record:
[openstax-cnxml-licence-provenance.md](openstax-cnxml-licence-provenance.md).

---

## 🔴 Read this first — the one mistake that quietly ruins the backup

**Do NOT back up from git.** Not `git archive`, not a fresh `git clone`, not "the GitHub zip".

Two books' images are deliberately excluded from git (`.gitignore`, *"Local-only source media (large;
kept off git for these books)"*), so a git-based copy silently omits them:

| | on disk | in a `git archive` |
|---|---:|---:|
| `liffraedi-2e` (Biology) images | **2,455** | **0** 🔴 |
| `edlisfraedi-2e` (Physics) images | **2,088** | **0** |

*Measured 2026-08-17.* Biology's images are **CC BY** and exist on exactly one disk — this machine.
They are the single most at-risk thing in the project, and they are precisely what a git-based backup
would leave behind, **with no error and no warning**.

▶ **Copy from the working tree on disk. Always.**

---

## Step 1 — Know what you are copying, and from where

```bash
cd ~/dev/repos/namsbokasafn-efni      # adjust if your checkout is elsewhere
du -sh books/*/01-source
```

Expect roughly **2.3 GB** across all five books. Copy **all five** — selecting only the three CC BY
books saves ~700 MB and creates a decision you would have to justify later.

Record the repo commit you are copying from — you will need it for the label:

```bash
git rev-parse HEAD
git status --porcelain     # ideally empty; if not, note what was uncommitted
```

---

## Step 2 — Make the archive

**Do not bother compressing hard.** The images are already-compressed JPEG/PNG, so gzip buys about
**9%** (measured: 347 MB → 314 MB on one book) — and compression makes the archive *more fragile*: a
single corrupted byte inside a `.gz` stream can render everything after it unreadable, while an
uncompressed `.tar` degrades one file at a time.

**Preferred — a plain, uncompressed tar:**

```bash
STAMP=$(date +%Y-%m-%d)
tar -cf ~/namsbokasafn-01-source-$STAMP.tar books/*/01-source
ls -lh ~/namsbokasafn-01-source-$STAMP.tar
```

**If a destination needs a single compressed file** (some cloud uploads prefer it):

```bash
tar -czf ~/namsbokasafn-01-source-$STAMP.tar.gz books/*/01-source
```

**Or skip archiving entirely** and copy the folder tree as-is to an external drive. That is the most
robust option of all — no container format to go wrong:

```bash
rsync -av --progress books/ /media/<your-drive>/namsbokasafn-books-$STAMP/
```

---

## Step 3 — Write the label. **This is the part that cannot be reconstructed later.**

The bytes do not state their own licence. Measured: **`md:license` appears in 0 of 567 CNXML files**
(positive control: `md:title` appears in 567 of 567). A folder of XML found in five years is
unprovenanced without a note beside it.

Save this next to the archive as `README-<date>.txt`, filling in the commit sha from Step 1:

```
namsbokasafn — OpenStax source archive (CNXML + images)

Taken:     <YYYY-MM-DD> from repo commit <sha from Step 1>
Contents:  books/*/01-source for all five books — CNXML, images, and for
           efnafraedi-2e also 01-source/docx/

LICENCE AT THE TIME EACH COPY WAS OBTAINED — this is the whole point of this archive:
  efnafraedi-2e       (Chemistry)         CC BY 4.0         obtained 2026-01-19
  orverufraedi        (Microbiology)      CC BY 4.0         obtained 2026-03-09
  liffraedi-2e        (Biology)           CC BY 4.0         obtained 2026-03-11
  edlisfraedi-2e      (College Physics)   CC BY-NC-SA 4.0   obtained 2026-03-23
  lifraen-efnafraedi  (Organic Chemistry) CC BY-NC-SA 4.0   obtained 2026-03-23

Upstream commits these were fetched from:
  liffraedi-2e   openstax/osbooks-biology-bundle    d2779c2edfb4   2026-03-11
  orverufraedi   openstax/osbooks-microbiology      ecf34dad129d   2026-03-02
  edlisfraedi-2e openstax/osbooks-college-physics-bundle  (see .source-info.json inside)
  lifraen-efnafraedi openstax/osbooks-organic-chemistry 2a1f82843a8b 2026-03-23
  efnafraedi-2e  openstax/osbooks-chemistry-bundle  (no .source-info.json recorded)

*** OpenStax relicensed these books CC BY -> CC BY-NC-SA on 2026-03-19. ***
*** The three CC BY copies above PREDATE that change and are irrevocably CC BY. ***
*** A fresh download from OpenStax today is NOT equivalent and NOT interchangeable. ***

Also note: books/efnafraedi-2e/01-source/ch00/m68662.cnxml was re-created by hand from
a CC BY-era Word export (01-source/docx/ch00/preface.docx, included here). It does not
exist upstream in any CC BY form. That docx is its only provenance basis.
```

---

## Step 4 — Checksum it, and keep the checksum somewhere else

```bash
cd ~
sha256sum namsbokasafn-01-source-$STAMP.tar > namsbokasafn-01-source-$STAMP.sha256
cat namsbokasafn-01-source-$STAMP.sha256
```

**Keep the checksum in a different place from the archive** — email it to yourself, or paste it into
a notes app. A checksum stored beside the file it checks tells you nothing if both were corrupted or
replaced together.

---

## Step 5 — Put copies in at least two places, ideally three

Rule of thumb: **two different media, one different building.**

- your personal computer (not this dev machine),
- a cloud drive,
- optionally an external drive kept elsewhere.

**Licence note, so you can store these without worrying:** the three CC BY books are freely
redistributable. Organic and Physics are CC BY-NC-SA — a *private backup* is storage, not
distribution, so cloud storage is fine; just do not publish them.

🔴 **Do NOT include `pipeline-output/sessions.db` in this archive.** It holds editorial work and
editor identities from Microsoft sign-in — personal data, a different risk category from public
textbook content. It is backed up separately, off-box.

---

## Step 6 — Verify you can actually read it back

A backup you have never opened is a hope, not a backup.

```bash
# does the checksum still match?
sha256sum -c namsbokasafn-01-source-$STAMP.sha256

# can you list it, and does the count look right?
tar -tf namsbokasafn-01-source-$STAMP.tar | wc -l

# pull one file out to a scratch location and look at it
mkdir -p /tmp/restore-test
tar -xf namsbokasafn-01-source-$STAMP.tar -C /tmp/restore-test \
    books/efnafraedi-2e/01-source/ch00/m68662.cnxml
head -20 /tmp/restore-test/books/efnafraedi-2e/01-source/ch00/m68662.cnxml
rm -rf /tmp/restore-test
```

---

## If you ever need to restore

1. **Do not overwrite `books/*/01-source/` in place as a first move.** Extract to a scratch
   directory and compare first — you want to know *what* differs before you replace anything.
2. Compare against the repo's own hash record, which covers CNXML:
   ```bash
   node tools/verify-source-manifest.js --all  # checks 01-source CNXML against .source-manifest.json
   # ⚠️ --all (or --book SLUG) is REQUIRED. The flagless form prints usage and exits 1,
   #    verifying NOTHING — and if you pipe it, the pipe masks the exit code and it reads
   #    as success. §C93 ⑥ⓐ; this guide prescribed the flagless form until 2026-08-23.
   ```
3. Only then copy the files you actually need back.

⚠️ **If the archive and the working tree disagree, that disagreement IS the finding.** Do not
"resolve" it by copying one over the other until you know which one moved and why. Overwriting
destroys the only evidence that told you something was wrong.

---

## When to do this again

**When the source materially changes** — a new book intake, or an authorised refresh of a book's
`01-source`. Not on a schedule: this content is frozen by design, so a routine job would mostly
re-copy identical bytes and lull you into assuming it is current when it is not.

**Never re-use an old label.** Each archive is a snapshot of a specific commit on a specific date;
write a fresh label every time, and **keep the older archives** rather than replacing them. The
oldest archive is the closest to the original acquisition, and therefore the best provenance
evidence you have.
