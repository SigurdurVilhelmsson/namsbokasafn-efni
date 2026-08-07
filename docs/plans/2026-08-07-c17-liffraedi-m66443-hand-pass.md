# C17 — biology `m66443` segment-edit hand pass (working document)

**Date:** 2026-08-07 · **For:** the editor re-applying these edits · **Book:** `liffraedi-2e` ch03
**Register item:** C17, in [`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md)
**Produced by:** `scripts/export-segment-edits.js` → `scripts/render-segment-edits-md.js`, against **prod**, read-only.

> **Frozen evidence, not status.** This is a **dated snapshot** of what production's
> `sessions.db` held on 2026-08-07. Per CLAUDE.md § *One source of truth* it carries no status
> verbs: **if it disagrees with the register, the register wins.** Regenerate it rather than
> edit it — the snapshot JSON it came from is gitignored at
> `pipeline-output/c17-biology-snapshot/` (it carries an `editor_id`, and this repo is public)
> and also lives on prod at `~/c17-liffraedi-2e-m66443-snapshot-2026-08-07.json`.

## ⚠️ Read these three things before using the document below

1. **"Fyrri vélþýðing" is NOT the previous MT for this book — it is the CURRENT baseline.**
   The renderer assumes the snapshot is taken *before* the re-MT, which is true for chemistry.
   For biology the re-MT **already ran**: these edits are dated 2026-03-09, and
   `books/liffraedi-2e/02-mt-output/ch03/*-provenance.json` records
   `"tool": "api-translate", "generatedAt": "2026-07-25T19:27Z"`. So the block labelled
   *Fyrri vélþýðing* is what is on disk **now**, and it is exactly what each edit should be
   judged against. The document's own instruction — *compare against the new MT, not the old
   one below* — reads backwards here.

2. **The baseline these edits were written against is gone, and that is already true.**
   Measured 2026-08-07: of the 11 rows with non-empty `original_content`, **none of those
   strings appear anywhere in the current 106-segment MT file** — not at their own id, not at
   any other. That is a wholesale baseline replacement, **not** positional drift. All 12
   segment ids still resolve, so nothing is orphaned; but `original_content` is not
   recoverable and is deliberately not shown below.

3. **Realistically this is ~7 judgements, not 12** *(an editorial reading, not a measurement —
   check it yourself)*. On four of the five `entry:` rows the 2026-07-25 MT already says what
   the editor wrote, differing only in a connector (`Adenín **og** gúanín` vs
   `Adenín**,** gúanín`), and the fifth — `auto-44` — has an **empty** `edited_content`. The
   seven `para:fs-id*` rows are the ones carrying work the new MT does not have: `__term__`
   markup and restructured sentences.

---

*Everything below this line is the generator's verbatim output. Do not hand-edit it; regenerate.*

---

# Ritstjórnarbreytingar — liffraedi-2e

**Tekið:** 2026-08-07T05:16:33.238Z · **main:** `de3de47ee763929ee6cd52b08637d69d0370f33a` · **Einingar:** m66443

**12 breytingar alls · 12 til endurnýtingar · 0 sleppt (rejected/superseded).**

> **Handvirk endurnýting.** Berðu hverja breytingu saman við **nýju vélþýðinguna** — ekki
> við þá gömlu hér að neðan. Ef nýja vélþýðingin segir þegar það sem ritstjórinn skrifaði
> þarf enga breytingu. Breytingar merktar *EKKI endurnýta* eru hafnaðar eða úreltar og
> eiga ekki að rata inn aftur.

> ⚠️ Röðin hér er röð skyndimyndarinnar (eining, þá bútauðkenni) — **ekki** endilega
> lesröð kaflans. Finndu hvern bút eftir auðkenni sínu í ritlinum.

---

## m66443 (kafli 3)

12 breyting(ar).

### 1. `m66443:entry:auto-44` · pending · SigurdurVilhelmsson

**Enska**
> Cytosine, thymine

**Fyrri vélþýðing**
> Cýtósín, týmín

**Breyting ritstjóra**
> 

### 2. `m66443:entry:auto-45` · pending · SigurdurVilhelmsson

**Enska**
> Cytosine, uracil

**Fyrri vélþýðing**
> Sýtósín, úrasíl

**Breyting ritstjóra**
> Sýtósín og úrasíl

### 3. `m66443:entry:auto-46` · pending · SigurdurVilhelmsson

**Enska**
> Purines

**Fyrri vélþýðing**
> Púrín

**Breyting ritstjóra**
> Púríns

### 4. `m66443:entry:auto-47` · pending · SigurdurVilhelmsson

**Enska**
> Adenine, guanine

**Fyrri vélþýðing**
> Adenín, gúanín

**Breyting ritstjóra**
> Adenín og gúanín

### 5. `m66443:entry:auto-48` · pending · SigurdurVilhelmsson

**Enska**
> Adenine, guanine

**Fyrri vélþýðing**
> Adenín, gúanín

**Breyting ritstjóra**
> Adenín og gúanín

### 6. `m66443:para:fs-id1354194` · pending · SigurdurVilhelmsson

**Enska**
> Scientists classify adenine and guanine as [[term:purines|term-00007]]. The purine's primary structure is two carbon-nitrogen rings. Scientists classify cytosine, thymine, and uracil as [[term:pyrimidines|term-00008]] which have a single carbon-nitrogen ring as their primary structure ([[xref:fig-ch03_05_01]]). Each of these basic carbon-nitrogen rings has different functional groups attached to it. In molecular biology shorthand, we know the nitrogenous bases by their symbols A, T, G, C, and U. DNA contains A, T, G, and C; whereas, RNA contains A, U, G, and C.

**Fyrri vélþýðing**
> Vísindamenn flokka adenín og gúanín sem [[term:púrín|term-00007]]. Aðalbygging púríns eru tveir kolefnis-nitur hringir. Vísindamenn flokka cýtósín, týmín og úrasíl sem [[term:pýrimídín|term-00008]] sem hafa einn kolefnis-nitur hring sem aðalbyggingu sína ([[xref:fig-ch03_05_01]]). Hver þessara grunn kolefnis-nitur hringja hefur mismunandi starfræna hópa tengda við sig. Í styttri útgáfu sameindalíffræðinnar þekkjum við niturbasana með táknum þeirra A, T, G, C og U. DNA inniheldur A, T, G og C; en RNA inniheldur A, U, G og C.

**Breyting ritstjóra**
> Adenín og gúanín flokkast sem __púrín__.  Grunn bygging púrína eru tveir kolefnishringir.  Sýtósín, þýmín og úrasíl (U) eru __pýrimítin__ sem hafa einn kolefnishring sem grunn byggingu ([#fig-ch03_05_01]).   Hver þessara grunn kolefnishringja er með ólíka, virka hópa tengda við sig.  Til að auðvelda okkur lífið munum við vísa í þessa basa sem A, T, G og C í DNA og A, U, G og C í RNA.

### 7. `m66443:para:fs-id1569149` · pending · SigurdurVilhelmsson

**Enska**
> Even though the RNA is single stranded, most RNA types show extensive intramolecular base pairing between complementary sequences, creating a predictable three-dimensional structure essential for their function.

**Fyrri vélþýðing**
> Þrátt fyrir að RNA sé einþátta sýna flestar RNA-gerðir mikla innansameindapörun basa milli samsvarandi raða, sem skapar fyrirsjáanlega þrívíddarbyggingu sem er nauðsynleg fyrir virkni þeirra.

**Breyting ritstjóra**
> Jafnvel þó RNA sé einþátta, þá mynda flestar RNA sameindir, basapör við sig sjálfar þannig að þau taka á sig þrívíða lögun sem eru mikilvæg fyrir starfsemi þeirra og hægt er að geta sér til um hvernig komi til með að líta út.

### 8. `m66443:para:fs-id1876142` · pending · SigurdurVilhelmsson

**Enska**
> [[term:Nucleic acids|term-00001]] are the most important macromolecules for the continuity of life. They carry the cell's genetic blueprint and carry instructions for its functioning.

**Fyrri vélþýðing**
> [[term:Kjarnsýrur|term-00001]] eru mikilvægustu stórsameindirnar fyrir samfellu lífs. Þær bera erfðaefni frumunnar og leiðbeiningar um starfsemi hennar.

**Breyting ritstjóra**
> __Kjarnsýrur__ eru mikilvægasta lífræna stórsameindin enda viðheldur hún öllu lífi.  Kjarnsýrur innihalda upplýsingar um hvernig frumur eiga að starfa og haga sér.

### 9. `m66443:para:fs-id1998871` · pending · SigurdurVilhelmsson

**Enska**
> The other type of nucleic acid, RNA, is mostly involved in protein synthesis. The DNA molecules never leave the nucleus but instead use an intermediary to communicate with the rest of the cell. This intermediary is the [[term:messenger RNA (mRNA)|term-00004]]. Other types of RNA—like rRNA, tRNA, and microRNA—are involved in protein synthesis and its regulation.

**Fyrri vélþýðing**
> Hin tegund kjarnsýru, RNA, tekur aðallega þátt í prótínmyndun. DNA-sameindirnar yfirgefa aldrei kjarnann heldur nota þær millilið til að eiga samskipti við restina af frumunni. Þessi milliliður er [[term:boðbera-RNA (mRNA)|term-00004]]. Aðrar tegundir RNA – eins og rRNA, tRNA og örRNA – taka þátt í prótínmyndun og stjórnun hennar.

**Breyting ritstjóra**
> Hin kjarnsýrugerðin, RNA, tekur að mestu þátt í próteinmyndu.  DNA fer aldrei út úr kjarnanum en sendir í staðin skammlífar sameindir sem eru afrit af DNA upplýsingunum, út úr kjarnanum og á þannig í samskipti við umfrymið.  Þessar sameindir kallast __mRNA (messenger RNA)__.  Aðrar RNA gerðir eru rRNA, tRNA og microRNA en þær taka allar þátt í prótein myndun og stjórnun þess.

### 10. `m66443:para:fs-id2144933` · pending · SigurdurVilhelmsson

**Enska**
> To learn more about DNA, explore the [[link:Howard Hughes Medical Institute BioInteractive animations|https://openstax.org/l/DNA]] on the topic of DNA.

**Fyrri vélþýðing**
> Til að læra meira um DNA skaltu skoða [[link:Howard Hughes Medical Institute BioInteractive hreyfimyndirnar|https://openstax.org/l/DNA]] um efnið DNA.

**Breyting ritstjóra**
> Til að læra meira um DNA, skoðaðu [Howard Hughes Medical Institute BioInteractive animations](https://openstax.org/l/DNA) um DNA

### 11. `m66443:para:fs-id2862975` · pending · SigurdurVilhelmsson

**Enska**
> The two main types of nucleic acids are [[term:deoxyribonucleic acid (DNA)|term-00002]] and [[term:ribonucleic acid (RNA)|term-00003]]. DNA is the genetic material in all living organisms, ranging from single-celled bacteria to multicellular mammals. It is in the nucleus of eukaryotes and in the organelles, chloroplasts, and mitochondria. In prokaryotes, the DNA is not enclosed in a membranous envelope.

**Fyrri vélþýðing**
> Tvær helstu tegundir kjarnsýra eru [[term:deoxýríbósakjarnsýra (DNA)|term-00002]] og [[term:ríbósakjarnsýra (RNA)|term-00003]]. DNA er erfðaefnið í öllum lifandi lífverum, allt frá einfruma bakteríum til fjölfruma spendýra. Það er í kjarna heilkjörnunga og í frumulíffærum, grænukornum og hvatberum. Í dreifkjörnungum er DNA ekki umlukið himnuhjúpi.

**Breyting ritstjóra**
> Tvær megin gerðir kjarnsýra eru __deoxyribonucleic acid (DNA)__ og __ribonucleic acid (RNA)__.  DNA er erfðaefni allra lífvera, allt frá einfruma bakteríum til fjölfruma spendýrs.  Það er í kjarna heilkjörnunga og í frumulíffærunum, hvatberum og grænukornum.  Hjá dreifkjörnungum er DNA fljótandi um í umfrymi þeirra.

### 12. `m66443:para:fs-id2904548` · pending · SigurdurVilhelmsson

**Enska**
> DNA and RNA are comprised of monomers that scientists call [[term:nucleotides|term-00005]]. The nucleotides combine with each other to form a [[term:polynucleotide|term-00006]], DNA or RNA. Three components comprise each nucleotide: a nitrogenous base, a pentose (five-carbon) sugar, and a phosphate group ([[xref:fig-ch03_05_01]]). Each nitrogenous base in a nucleotide is attached to a sugar molecule, which is attached to one or more phosphate groups.

**Fyrri vélþýðing**
> DNA og RNA eru samsett úr einliðum sem vísindamenn kalla [[term:kirni|term-00005]]. Kirnin sameinast hvert öðru og mynda [[term:fjölkirni|term-00006]], DNA eða RNA. Hvert kirni er samsett úr þremur hlutum: niturbasa, pentósa (fimm-kolefna) sykru og fosfathópi ([[xref:fig-ch03_05_01]]). Hver niturbasi í kirni er tengdur við sykursameind, sem er tengd við einn eða fleiri fosfathópa.

**Breyting ritstjóra**
> DNA og RNA eru mynduð úr einliðum sem kallast núkleótíð.  Núkleótíðin tengjast saman til að mynda __fjölnúkleótíðin__ DNA og RNA.  Hvert núkleótíð er svo myndað úr þremur einingum: Niturbasa, pentósa (sykra mynduð úr fimm kolefnum) og fosfathóp ([#fig-ch03_05_01]).  Hver nitubasi í núkleótíði er tengdur við einn eða fleiri fosfathópa.
