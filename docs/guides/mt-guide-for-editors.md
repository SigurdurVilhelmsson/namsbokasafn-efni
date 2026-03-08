# Leiðbeiningar um vélþýðingu

Þetta skjal lýsir því hvernig á að nota vélþýðingarþjónustuna malstadur.is til að þýða efni úr ensku yfir á íslensku innan verkflæðis Námsbókasafnsins.

---

## Forsendur

Áður en vélþýðing hefst þarf:

- [ ] Bók skráð í verkflæðiskerfið
- [ ] CNXML-upprunaskrár dregnar út (Step 1a lokið)
- [ ] EN-segmentaskrár til staðar í `02-for-mt/`

---

## Aðferð 1: Skráahleðsla (ráðlögð)

### Skref 1: Sækja EN-skrár

1. Opnaðu verkflæðisviðmótið (pipeline UI)
2. Veldu bók og kafla
3. Smelltu á **"↓ Sækja EN"**
   - Þetta keyrir verndarskref sjálfkrafa (breytir `<!-- SEG:... -->` í `{{SEG:...}}`)
   - ZIP-skrá hleðst niður með vernduðum `.en.md` skrám
4. Afþjappaðu ZIP-skrána

### Skref 2: Þýða á malstadur.is

1. Farðu á [malstadur.is](https://malstadur.is)
2. Hladdu upp `.en.md` skrám
3. Bíddu eftir þýðingu
4. Sæktu þýddar `.is.md` skrár

**Athugið:** Gangið úr skugga um að skráarheiti séu á réttum sniðum: `m{NNNNN}-segments.is.md`

### Skref 3: Hlaða upp IS-skrám

1. Í verkflæðisviðmótinu, smelltu á **"↑ Hlaða upp IS"**
2. Veldu þýddar `.is.md` skrár
3. Kerfið:
   - Athugar hvort hlutamerki (SEG tags) séu til staðar
   - Vistar skrár í `02-mt-output/`
   - Keyrir afverndarskref sjálfkrafa
   - Uppfærir stöðu kaflans

---

## Aðferð 2: Afrita/Líma (varaleiðin)

Notaðu þessa aðferð ef skráahleðsla virkar ekki (t.d. ef malstadur.is fjarlægir hlutamerki úr skrám).

### Skref 1: Afrita EN-texta

1. Opnaðu EN-segmentaskrá (úr `02-for-mt/`) í textaritli
2. Afritaðu allt innihald skráarinnar (Ctrl+A, Ctrl+C)

### Skref 2: Þýða

1. Farðu á [malstadur.is](https://malstadur.is)
2. Límdu textann í þýðingarreitinn
3. Bíddu eftir þýðingu
4. Afritaðu þýddan texta

### Skref 3: Vista þýðingu

1. Opnaðu nýja skrá í textaritli (t.d. Typora eða VS Code)
2. Límdu þýddan texta
3. Vistaðu sem `m{NNNNN}-segments.is.md` í `02-mt-output/ch{NN}/`

### Eftir afritual/líming

Ef skráin inniheldur `{{SEG:...}}` merki (frá vernduðum skrám), keyrðu afverndarskref:

```bash
node tools/unprotect-segments.js --chapter {N} --verbose
```

Ef skráin inniheldur `<!-- SEG:... -->` merki, þarf ekkert afverndarskref.

---

## Gátlisti

### Fyrir vélþýðingu
- [ ] Kafli valinn í verkflæðisviðmóti
- [ ] "↓ Sækja EN" smellt — ZIP-skrá sótt
- [ ] ZIP-skrá afþjöppuð — `.en.md` skrár athugaðar

### Eftir vélþýðingu
- [ ] `.is.md` skrár sóttar af malstadur.is
- [ ] Skráarheiti athugað (sama snið og EN-skrár, nema `.is.md`)
- [ ] "↑ Hlaða upp IS" smellt — skrár hlaðið upp
- [ ] Engar viðvaranir um hlutamerki (SEG tags)
- [ ] Staða kaflans uppfærð í verkflæðisviðmóti

### Ef vandamál koma upp
- [ ] Ef viðvörun um vantar hlutamerki → notaðu aðferð 2 (afrita/líma)
- [ ] Ef "Skrár eru ekki verndaðar" villa → smelltu aftur á "↓ Sækja EN"
- [ ] Ef þýðingar birtast ekki í ritstjóra → athugaðu hvort `<!-- SEG:` merki séu í skrám í `02-mt-output/`

---

## Hvað gera hlutamerkin?

Hlutamerki (segment markers) tengja saman texta í uppruna og þýðingu:

```
<!-- SEG:m68724:para:1 -->
Þetta er þýddur texti.
```

Þessi merki eru nauðsynleg til að verkflæðiskerfið geti:
- Birt texta í ritstjóranum (segment editor)
- Sprautað þýðingum aftur inn í CNXML-uppbyggingu
- Myndað endanlegt HTML

**Án hlutamerkja birtast þýðingar ekki í ritstjóranum.**

---

## Samantekt

| Aðgerð | Verkflæðisviðmót | Skipanalína |
|--------|-----------------|-------------|
| Sækja EN | "↓ Sækja EN" hnappurinn | `cnxml-extract.js` + `protect-segments-for-mt.js` |
| Hlaða upp IS | "↑ Hlaða upp IS" hnappurinn | Afrita í `02-mt-output/` + `unprotect-segments.js` |

---

## Sjá einnig

- [MT Process Guide](../workflow/mt-process.md) — ítarleg tæknilýsing (enska)
- [Simplified Workflow](../workflow/simplified-workflow.md) — heildaryfirlit verkflæðis
