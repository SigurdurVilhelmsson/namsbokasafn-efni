# Glossary pre-screen report (c19)

Runs: `20261118T092112Z-676d2313` (full). Model claude-fable-5-2. Prompt `tools/ai-review/prompts/glossary-prescreen-v1.md`, sha256 `8d5e82e72cdd46ceb4ac2ffc9dea2f4d7106bf9623de4e25e523201c7a3eb07c`.

## Verdicts

| group | fine | flag | unjudged | rows |
|---|---|---|---|---|
| chemistry | 284 | 26 | 0 | 310 |
| physics and biology | 1050 | 186 | 0 | 1236 |
| all | 1334 | 212 | 0 | 1546 |

## Flag kinds

| kind | rows |
|---|---|
| wrong-sense | 38 |
| some-senses-only | 95 |
| wrong-register | 63 |
| not-a-word | 4 |
| other-error | 12 |

## Unjudged rows (open; never counted as fine)

None.

## Excluded from the population

| class | rows |
|---|---|
| ruled | 209 |
| fallback | 1381 |
| tie | 348 |
| decided | 0 |
| physicsBiology | 0 |
| notInExport | 124 |
| noSentence | 0 |
| physicsBiologyNoSentence | 1 |

## Controls

Gate: PASS (16 of 16 controls as expected).

| id | control | expected | got | ok | the model’s reason |
|---|---|---|---|---|---|
| r097 | anode | fine | fine | ok | Anóða is an established Icelandic word for the anode electrode (alongside forskaut), which is the sense in every sentence. |
| r208 | moles | flag | flag | ok | The sentences use moles as the unit of amount of substance, which is mól. Moldvörpur means the burrowing animals. |
| r223 | carbonate | fine | fine | ok | Karbónat is the standard chemical term for carbonate. |
| r337 | addition-adding | flag | flag | ok | The sentences use addition for the act of adding something (energy, solvent, electrons, acid, lime), which is viðbót or íbót. Álagning means a levy or markup, or at most the organic addition reaction, which none of these sentences use. |
| r395 | calorimeter | fine | fine | ok | Varmamælir is the established Icelandic term for a calorimeter. |
| r466 | vessel | flag | flag | ok | Every sentence uses vessel for a container (reaction vessel, calorimeter vessel), which is ílát. Æð means a blood vessel or vein. |
| r542 | phases | flag | flag | ok | Kvartilaskipti means the phases of the moon. The sentences use phases for states of matter (solid, liquid, gas) and for the phase of a wave function, both of which are fasi. |
| r552 | depression | flag | flag | ok | The sentences use depression for the lowering of a freezing point and for a dent in a surface. Þunglyndi is the mental illness and fits neither. |
| r582 | addition-reaction | fine | fine | ok | Every sentence uses addition in 'addition reaction', and álagning is used for this in Icelandic organic chemistry (álagningarhvarf). |
| r849 | crystalline | fine | fine | ok | Kristalkenndur is a validly formed adjective on the stem kristal- (as in kristaltær) and conveys the crystalline sense used here; kristallaður is more usual, but that is a choice of term. |
| r931 | terms | flag | flag | ok | Tíðir means tenses, periods of time or menstruation. The sentences use the phrase 'in terms of' (með tilliti til, út frá) and terms as words or names (hugtök, heiti), so tíðir fits none of them. |
| r967 | rays | flag | flag | ok | The sentences use rays for beams of radiation (X-rays, the sun's rays, alpha, beta and gamma rays), which is geislar. Skötur means the fish called rays (skates). |
| r975 | bond length | fine | fine | ok | Tengilengd names the distance between the nuclei of two bonded atoms, as the sentences use it. |
| r1249 | reduce | flag | flag | ok | Every sentence uses reduce to mean lower or decrease (emissions, concentration, yield, a pollutant), which is minnka or draga úr. Einfalda means simplify, a different sense of the word. |
| r1255 | atom | fine | fine | ok | Atóm is an established Icelandic term for atom; frumeind would be an alternative, not a correction. |
| r1326 | balanced | flag | flag | ok | Every sentence uses balanced for a chemical equation whose coefficients have been adjusted, which is stillt (stillt efnajafna). Í jafnvægi means at equilibrium, a different chemistry concept, so it would mislead editors. |

## Cost

- `20261118T092112Z-676d2313` (full): claude-fable-5-2, effort high, ended complete: USD 7.541988 = ISK 923
- `20261118T085951Z-5f8273b4` (pilot; cost only, no verdicts): claude-fable-5-2, effort high, ended complete: USD 0.511677 = ISK 63
- `20261118T090147Z-33566f2f` (pilot; cost only, no verdicts): claude-opus-5-5, effort high, ended complete: USD 0.256697 = ISK 31
- total: USD 8.310362 = ISK 1017

USD from each run's run-end.json; ISK at 122.4 ISK per USD; source: Seðlabanki Íslands official mid-rate (miðgengi) for USD, 9 Nov 2026, as published by gjaldmidlar.is; retrieved 2026-11-18.
