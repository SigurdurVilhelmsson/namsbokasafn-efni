# Talking points · Punktar fyrir kynningar

> 🧊 Dated snapshot, 2026-10-30. Evidence, never status; see `README.md`.

## English

### Now — overview (`now-overview.svg`)

Today, every chapter is machine translated and published as a preview first. Editors then review it in Ritstjóri, and each module switches to the reviewed text once a head editor approves it.

- New translation comes only from the Málstaður API. Editors work on that machine text; they never start from a blank page.
- The translation memory (TMX) is rebuilt from approved text after each approval.
- Pages reach readers through a manual sync and deploy run by the project lead.

### Now — technical (`now-technical.svg`)

Today, technically: each stage writes its own folder under books/&lt;slug&gt;/. Edits stay in the server database until they are applied, and inject and render then rebuild the HTML.

- 01-source/ and 02-mt-output/ are read-only. The pure MT in 02-mt-output/ is the first of the research layers.
- The red notes are two known defects: the first approval writes the whole module into 03-faithful-translation/, and the TMX counts every faithful segment as human-verified.
- Chemistry has an apply hold in code (PR #556): nothing writes its faithful files until a base-text guard exists.
- The 2-hourly cron pushes content to GitHub. The automatic sync to the reader has never worked, so publishing is manual.
- The rule layer and the AI term pass are being built in ai-review/. Nothing from them reaches editors yet.

### Planned — overview (`plan-overview.svg`)

The plan for the follow-on project year, from 1 November 2026: the same backbone, plus machine-prepared term suggestions, measurement of editing, three gates and new outputs.

- Three text layers stay apart: pure MT, machine-revised suggestions, and text an editor approved. A research paper can then compare them.
- Suggestions never become starting text. Editors accept or reject each one (decisions of 28 October 2026).
- Editing waits for the editing gate, because editing done before measurement is live can never be measured afterwards.
- Approved edits wait in the database until the apply gate. Nothing is released before the release gate.

### Planned — technical (`plan-technical.svg`)

The plan, technically: new layer folders, a ruling set that drives the rule layer and the AI term pass, three gates that each list what must hold, and the work packages B1–B3, C and D around editing.

- Layer 1s (02-mt-selected/) picks, per segment, among API runs and re-requests untranslated segments. It never holds a word that is not API output.
- Layer 2 records hashes of its inputs, the ruling set, the prompt and the model, and refuses a module if any of them changes.
- B1 records which text the editor was shown, each edit’s origin, revision history and active time. Results are reported only in aggregate.
- Exports count a segment as human only if an editor changed or accepted it. Releases are CC BY 4.0 and carry no BÍN-derived forms.
- Some decisions in the plan (its §8) are still open and can change details here.

### What changes between the two

| | Now | Planned |
|---|---|---|
| Starting text | Faithful text if it exists, otherwise pure MT | Human, then selected MT (layer 1s), then pure MT |
| Term fixes | Glossary sent with the MT request; term check in the editor | Ruling set → rule layer and a gated AI pass, shown as suggestions; lemma-based term tools (B2, B3) |
| What counts as human | The whole module, once one edit is approved | Only segments an editor changed or accepted |
| Measurement | Before and after text of each edit | Served version, edit origin, revision history, active time, edit distance (B1) |
| Safeguards | Apply hold on chemistry (PR #556) | Editing gate, apply gate, release gate |
| Outputs | MT preview and faithful pages; TMX | Reviewed book, audio (C), and TMX, corpus and term collection under CC BY 4.0 (D) |
| Delivery | Manual sync and deploy | Manual sync by book, optional chapter hold-back, credit sentence on pages |

## Íslenska

### Í dag — yfirlit (`now-overview.is.svg`)

Í dag er hver kafli vélþýddur og birtur fyrst sem forskoðun. Ritstjórar yfirfara hann síðan í Ritstjóra, og hver eining skiptir yfir í yfirfarna textann þegar aðalritstjóri samþykkir hana.

- Ný þýðing kemur eingöngu úr vélþýðingu Málstaðar. Ritstjórar vinna með þann texta og byrja aldrei á auðri síðu.
- Þýðingaminnið (TMX) er endursmíðað úr samþykktum texta eftir hverja samþykkt.
- Síðurnar komast til lesenda með handvirkri samstillingu og útgáfu sem verkefnisstjóri keyrir.

### Í dag — tæknilegt (`now-technical.is.svg`)

Í dag, tæknilega: hvert þrep skrifar í sína möppu undir books/&lt;slug&gt;/. Breytingar eru geymdar í gagnagrunni þjónsins þar til þær eru vistaðar í skrár, og síðan smíða innsetning og teiknun HTML-síðurnar á ný.

- 01-source/ og 02-mt-output/ eru aðeins lesnar. Hreina vélþýðingin í 02-mt-output/ er fyrsta rannsóknarlagið.
- Rauðu athugasemdirnar eru tveir þekktir gallar: fyrsta samþykkt skrifar alla eininguna í 03-faithful-translation/, og TMX telur alla ritstýrða búta yfirfarna af mönnum.
- Efnafræðin er í bið í kóðanum (PR #556): ekkert skrifar ritstýrðu skrárnar hennar fyrr en vörn fyrir grunntexta er komin.
- Á tveggja tíma fresti ýtir sjálfvirk keyrsla efninu á GitHub. Sjálfvirka samstillingin við lesendavefinn hefur aldrei virkað, svo birting er handvirk.
- Reglulagið og íðorðayfirferð gervigreindar eru í smíðum í ai-review/. Ekkert úr þeim berst ritstjórum enn.

### Áætlun — yfirlit (`plan-overview.is.svg`)

Áætlunin fyrir verkefnisár framhaldsverkefnisins, frá 1. nóvember 2026: sami grunnur, auk vélrænna íðorðatillagna, mælinga á ritstjórn, þriggja hliða og nýrra afurða.

- Þrjú textalög eru geymd aðskilin: hrein vélþýðing, vélrænar tillögur og texti sem ritstjóri samþykkti. Þannig getur rannsóknargrein borið þau saman.
- Tillögur verða aldrei að upphafstexta. Ritstjórar samþykkja eða hafna hverri og einni (ákvarðanir 28. október 2026).
- Ritstjórn bíður ritstjórnarhliðsins, því vinnu sem fer fram áður en mælingar eru komnar í gang er aldrei hægt að mæla eftir á.
- Samþykktar breytingar bíða í gagnagrunninum fram að vistunarhliðinu. Ekkert er gefið út fyrr en skilyrði útgáfuhliðsins eru uppfyllt.

### Áætlun — tæknilegt (`plan-technical.is.svg`)

Áætlunin, tæknilega: nýjar möppur fyrir textalögin, íðorðaúrskurðir sem stýra reglulagi og íðorðayfirferð gervigreindar, þrjú hlið sem hvert telur upp skilyrði sín, og verkþættirnir B1–B3, C og D í kringum ritstjórnina.

- Lag 1s (02-mt-selected/) velur fyrir hvern bút milli keyrslna vélþýðingarinnar og biður aftur um óþýdda búta. Þar er aldrei orð sem ekki kom frá vélþýðingunni.
- Lag 2 skráir tætigildi inntaks, úrskurða, fyrirmæla og líkans, og hafnar einingu ef eitthvað af því breytist.
- B1 skráir hvaða texta ritstjóri sá, uppruna hverrar breytingar, breytingasögu og virkan vinnutíma. Niðurstöður eru aðeins birtar samanlagðar.
- Útflutningur telur bút mannlegan aðeins ef ritstjóri breytti honum eða samþykkti hann. Útgáfur eru undir CC BY 4.0 og innihalda engar beygingarmyndir úr BÍN.
- Sumar ákvarðanir í áætluninni (8. kafli hennar) eru enn opnar og geta breytt smáatriðum hér.

### Hvað breytist

| | Í dag | Áætlun |
|---|---|---|
| Upphafstexti | Ritstýrður texti ef hann er til, annars hrein vélþýðing | Mannlegt, svo valin vélþýðing (lag 1s), svo hrein vélþýðing |
| Íðorðaleiðréttingar | Orðalisti sendur með vélþýðingunni; íðorðaprófun í ritlinum | Íðorðaúrskurðir → reglulag og hliðvarin yfirferð gervigreindar, sýnt sem tillögur; íðorðatól byggð á nefnimyndum (B2, B3) |
| Hvað telst mannlegt | Öll einingin þegar ein breyting hefur verið samþykkt | Aðeins bútar sem ritstjóri breytti eða samþykkti |
| Mælingar | Texti fyrir og eftir hverja breytingu | Sýndur texti, uppruni breytinga, breytingasaga, virkur tími, breytingafjarlægð (B1) |
| Varnir | Bið á efnafræði (PR #556) | Ritstjórnarhlið, vistunarhlið, útgáfuhlið |
| Afurðir | Forskoðun vélþýðingar og ritstýrðar síður; TMX | Yfirfarin bók, hljóð (C), og TMX, málheild og íðorðasafn undir CC BY 4.0 (D) |
| Birting | Handvirk samstilling og útgáfa | Handvirk samstilling eftir bókum, köflum haldið eftir ef þarf, þakkarsetning á síðum |
