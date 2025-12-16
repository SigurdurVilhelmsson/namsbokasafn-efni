# Námsbókasafn - Þýðingar

Geymsla fyrir íslenskar þýðingar á OpenStax kennslubókum.

## Um verkefnið

Þetta verkefni hefur að markmiði að gera hágæða kennslubækur aðgengilegar íslenskum nemendum með því að þýða opnar kennslubækur frá OpenStax. Allar þýðingar eru gefnar út undir Creative Commons CC BY 4.0 leyfi.

## Bækur

| Bók | Frumrit | Staða |
|-----|---------|-------|
| **Efnafræði** | [Chemistry 2e](https://openstax.org/details/books/chemistry-2e) | Í vinnslu |
| **Líffræði** | [Biology 2e](https://openstax.org/details/books/biology-2e) | Fyrirhugað |

## Útgáfa

Þýddar bækur verða aðgengilegar á [námsbókasafn.is](https://namsbokasafn.is) (væntanlegt).

## Verkflæði

Þýðingarferlið felur í sér:

1. Sækja .docx skrár frá OpenStax
2. Vélþýðing á malstadur.is
3. Þýðingaminni (TM) byggt upp með Matecat
4. Ritstjórn og yfirlestur
5. Útgáfa í .md sniði

Sjá nánar í [docs/workflow.md](docs/workflow.md).

## Uppbygging geymslu

```
books/
├── efnafraedi/          # Efnafræði (Chemistry 2e)
│   ├── 01-source/       # Upprunalegar skrár
│   ├── 02-machine-translation/  # Vélþýðing
│   ├── 03-tm-translated/        # TM þýðing
│   ├── 04-editor-review/        # Ritstjórn
│   ├── 05-final-docx/           # Endanleg .docx
│   ├── 06-publication/          # Útgefin .md
│   └── tm/              # Þýðingaminni (.tmx)
└── liffraedi/           # Líffræði (Biology 2e)
```

## Höfundaréttur

### Þýðingar
Allar þýðingar eru gefnar út undir [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) leyfi.

### Upprunalegt efni
Byggt á opnum kennslubókum frá [OpenStax](https://openstax.org/), Rice University, gefið út undir CC BY 4.0 leyfi.

**Efnafræði:**
- Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson
- *Chemistry 2e*, OpenStax, 2019

### Verkfæri
Verkfæri og skriftur í þessari geymslu eru gefin út undir MIT leyfi.

## Tengiliður

**Sigurður E. Vilhelmsson**
Þýðandi og verkefnisstjóri

---

*Þetta verkefni er ekki tengt OpenStax eða Rice University. OpenStax er ekki ábyrgt fyrir innihaldi þýðinga.*
