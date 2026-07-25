# SETUP — CNXML schema validation gate (experiment)

Reproducible toolchain + schema setup for the jing/RelaxNG validation experiment.
Everything here is confined to `experiments/cnxml-validation-gate/`.

## 1. Environment recorded at time of run

| Component | Value |
|---|---|
| Date of run | 2026-07-25 |
| OS | Ubuntu 26.04 LTS (WSL2, Linux 6.18.33.2-microsoft-standard-WSL2) |
| jing | Debian package `jing` **20241231+repack-1** (`/usr/bin/jing`, a shell wrapper around `/usr/share/java/jing.jar`) |
| Java | OpenJDK **25.0.3** 2026-04-21 (Ubuntu build 25.0.3+9-2-26.04.2) |
| Node | 22.x (`.nvmrc`) — used only for the Task 3 gate script |

**jing was already installed system-wide**; no install step was needed for this run.
To reproduce on a clean box:

```bash
sudo apt install jing        # pulls default-jre / java-wrappers
jing                          # prints usage; confirms wrapper + jar resolve
```

The Debian `jing` wrapper is equivalent to `java -jar jing.jar`. If the package is
unavailable, download `jing-trang` and substitute `java -jar /path/to/jing.jar`
everywhere below — the CLI arguments are identical.

## 2. External clones (NOT vendored)

Both OpenStax repos are **AGPL-3.0**. They are cloned into
`experiments/cnxml-validation-gate/external/`, which is listed in
`experiments/cnxml-validation-gate/.gitignore`. **No file from either repo is
committed to this repository, and no XSLT or code from them is copied or executed
as part of this project.** jing is invoked as an external tool; the `.rng` files are
consumed as validation *data*.

```bash
cd experiments/cnxml-validation-gate/external

git clone --branch poet-schema --depth 50 https://github.com/openstax/cnxml.git cnxml
git clone --depth 20 https://github.com/openstax/cnx-transforms.git cnx-transforms

# master is needed only for the schema-branch comparison in FINDINGS.md §1
cd cnxml && git fetch --depth 50 origin master && git worktree add ../cnxml-master FETCH_HEAD
```

Pinned commits actually used (branches move — these SHAs are what the reports describe):

| Repo | Ref | SHA |
|---|---|---|
| openstax/cnxml | `poet-schema` | `227825900ebec1d8b0621d5be5ea510a062c0005` |
| openstax/cnxml | `master` (comparison only) | `0eb1f576c2380f3f395508acc855bcff76343082` |
| openstax/cnx-transforms | `master` (reference only, nothing run) | `34604e1fb174ce1b16cd2f5264084274a46b0c21` |

## 3. The schema to use

```
experiments/cnxml-validation-gate/external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-jing.rng
```

### Why this file

- **It is OpenStax's own canonical entry point.** `cnxml/validation.py:15` in that repo
  reads `CNXML_JING_RNG = lookup_resource('xml/cnxml/schema/rng/0.7/cnxml-jing.rng')`
  and `validate_cnxml()` passes it to jing. We use exactly what they use.
- **`poet-jing.rng` is only a dispatcher.** It is 15 lines: `<start>` is a `<choice>`
  between COLLXML 2.0 and an `externalRef` to this same `cnxml-jing.rng`. For a
  single-module `.cnxml` file it adds nothing but a second grammar to compile (and it
  duplicates every schema-level diagnostic). Use `poet-jing.rng` only if you also want
  to validate `collection.xml` files with one schema.
- **The `-jing.rng` variants exist to fix hrefs.** The non-jing `cnxml-simplified.rng`
  still points at `mathml/schema/rng/2.0/`, a directory the `poet-schema` branch
  deleted. Only the `-jing` drivers resolve on this branch.
- **MathML is a real grammar, not a wildcard.** `cnxml-common-jing.rng` binds
  `mathml-math` to `externalRef href=".../mathml/schema/rng/3.0/mathml3.rng"`, so
  MathML content is genuinely validated (relevant to the math-heavy pilot chapter).

### Why `poet-schema` and not `master`

Both branches ship a `0.7` directory, and our sources are CNXML 0.7 (see FINDINGS §1).
Measured against the same 1192 pristine source files, `poet-schema` is the better match:

| | poet-schema | master |
|---|---|---|
| `media` requires `@id` | no (relaxed) | **yes** → +51 false errors on legacy physics |
| MathML | 3.0 | 2.0 only |
| `data-platform-hidden`, `data-lang` | supported | unknown attribute |
| Total non-abstract errors, 1192 pristine files | **6** | 56 |

## 4. Required invocation flags

```bash
jing -i <schema.rng> <file.cnxml> [more files...]
```

**`-i` is mandatory, and it is OpenStax's own flag** (`cnxml/jing.py:53`:
`cmd.extend([str(JING_JAR), '-i', str(rng_filepath)])`). It disables RELAX NG
DTD-compatibility ID/IDREF checking.

Without `-i` the grammar **does not compile at all** — every run dies with:

```
mathml3-common.rng:182:14: error: conflicting ID-types for attribute "id"
    of element "table" from namespace "http://cnx.rice.edu/cnxml"
```

Cause: CNXML declares `table/@id` as `<data type="ID"/>` (`cnxml-defs.rng:13-19`),
while MathML 3's `anyElement` pattern (`mathml3-common.rng:181-195`) matches any
non-MathML element — including `cnxml:table` — with an untyped `<attribute><anyName/></attribute>`.
Two ID-types for the same attribute makes jing refuse the grammar. This is a defect in
the *schema composition*, not in any document.

**Consequence to be aware of:** `-i` also switches off duplicate-`id` detection, which
would otherwise be a valuable reinjection check. The Task 3 gate script therefore
implements its own duplicate-`id` check in Node rather than relying on jing for it.

### Batch, don't loop

jing accepts many files per invocation and amortises JVM startup across all of them.
Measured on this box:

| Set | Batched | Per-file loop | Speed-up |
|---|---|---|---|
| ch12, 8 modules | 708 ms | 4 729 ms (591 ms/file) | **6.7×** |
| whole book, 149 modules | ~1 310 ms (3-run mean) | ~88 s (extrapolated at 591 ms/file) | **~68×** |

Batching is essentially free above a handful of files because JVM + grammar-compile
startup (~0.6 s) is paid once. The gate script batches.

**But batching has a correctness trap — see §4.1.**

### 4.1 jing aborts the batch on the first fatal error

If any file in a batch has an XML **well-formedness** error, jing reports it as
`fatal:` and **stops processing every remaining file in that batch**. Demonstrated:

```
$ jing -i schema.rng broken.cnxml good1.cnxml good2.cnxml
broken.cnxml:66:20: fatal: The element type "row" must be terminated by ...
# good1 and good2 are never validated, and jing still exits 1
```

A naive batched gate would therefore report one broken file and **silently skip
everything after it** — fail-quiet, the exact opposite of what a gate is for. This
is not hypothetical: it initially hid three real defects in `liffraedi-2e/ch05`
during this experiment.

`validate-cnxml.js` handles it by re-running the un-validated remainder after each
fatal, so coverage is always complete while keeping the batched speed.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | all files valid |
| 1 | validation errors found (**or** the schema failed to compile — see below) |
| 2 | fatal/usage error (unreadable file, bad schema path) |

Note that jing returns **1** both for genuine document errors and for schema
compilation failures. The gate script distinguishes them by checking whether an error
line's filename is inside the schema directory rather than by exit code alone —
otherwise a mistyped schema path reads as "every file failed", the opposite of fail-loud.

## 5. Reproducing the baseline runs

```bash
SCHEMA=experiments/cnxml-validation-gate/external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-jing.rng

# pristine originals for one book
jing -i "$SCHEMA" $(find books/efnafraedi-2e/01-source -name '*.cnxml' | sort)

# reinjected output for one book
jing -i "$SCHEMA" $(find books/efnafraedi-2e/03-translated/mt-preview -name '*.cnxml' | sort)
```

Raw captured output lives in `results/` (gitignored).

## 6. Reference material consulted (read only, nothing copied)

- `external/cnxml/cnxml/validation.py` — canonical schema path + entry points
- `external/cnxml/cnxml/jing.py` — canonical `-i` flag, batching, error-line parsing
- `external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-defs.rng` — `id-attribute`,
  `common-attributes-noclass`, element content models
- `external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-abstract-defs.rng` — the
  restricted abstract content model
- `external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-common-jing.rng` — how abstract,
  MathML, QML and MDML are bound together
- `external/cnxml/cnxml/xml/mathml/schema/rng/3.0/mathml3-common.rng` — `anyElement`
- `external/cnxml/README.rst` — OpenStax's documented editor/validation setup
