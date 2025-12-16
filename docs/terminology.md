# Terminology Standards

This document establishes terminology standards for Icelandic translations of OpenStax textbooks.

## Importance of Consistent Terminology

Consistent terminology is crucial for:
- **Clarity**: Students should encounter the same terms throughout the text
- **Searchability**: Consistent terms make it easier to find related content
- **Standards**: Aligns with established Icelandic scientific vocabulary
- **Quality**: Inconsistent terminology is a sign of poor translation quality

## Terminology Sources

When translating technical terms, consult these resources in order:

1. **Íðorðabankinn** (Icelandic Term Bank): https://idord.arnastofnun.is/
2. **Orðabanki Háskóla Íslands**: https://ordabanki.hi.is/
3. **Established textbooks**: Icelandic chemistry/biology textbooks used in schools
4. **Glossary in this repo**: `books/{book}/06-publication/glossary.json`

## Format for Terminology Entries

Use this format when documenting terminology decisions:

| English | Icelandic | Notes | Source |
|---------|-----------|-------|--------|
| term | íslenskt hugtak | Usage notes or context | Reference |

## Chemistry Terminology Examples

| English | Icelandic | Notes | Source |
|---------|-----------|-------|--------|
| atom | atóm, frumeind | "frumeind" sometimes used interchangeably | Íðorðabankinn |
| molecule | sameind | | Íðorðabankinn |
| element | frumefni | | Íðorðabankinn |
| compound | efnasamband | | Íðorðabankinn |
| electron | rafeind | | Íðorðabankinn |
| proton | róteind | | Íðorðabankinn |
| neutron | nifteind | | Íðorðabankinn |
| ion | jón | | Íðorðabankinn |
| cation | katjón | Positively charged ion | Íðorðabankinn |
| anion | anjón | Negatively charged ion | Íðorðabankinn |
| bond | efnatengi, binding | "efnatengi" for chemical bond | Íðorðabankinn |
| covalent bond | samgildistengi | | Íðorðabankinn |
| ionic bond | jónatengi | | Íðorðabankinn |
| mole | mól | SI unit | Íðorðabankinn |
| reaction | efnahvarf | Chemical reaction | Íðorðabankinn |
| solution | lausn | | Íðorðabankinn |
| solvent | leysiefni | | Íðorðabankinn |
| solute | leysið efni | The dissolved substance | Íðorðabankinn |
| acid | sýra | | Íðorðabankinn |
| base | basi | | Íðorðabankinn |
| oxidation | oxun | | Íðorðabankinn |
| reduction | afoxun | | Íðorðabankinn |

## Adding New Terms

When you encounter a term that is not in this list:

1. Check the terminology sources listed above
2. If found, add to `glossary.json` with source reference
3. If not found, discuss with project lead before choosing a translation
4. Document your decision with reasoning

## Terminology Disputes

If there is disagreement about a term:

1. Check official Icelandic terminology databases
2. Consider context and target audience (secondary school students)
3. Prefer terms that are:
   - Already established in Icelandic education
   - Easy to understand for beginners
   - Consistent with related terms
4. Document the decision and reasoning in the glossary

## Full Terminology List

The complete, searchable terminology list is maintained in:
- `books/efnafraedi/06-publication/glossary.json` (Chemistry)
- `books/liffraedi/06-publication/glossary.json` (Biology)

These JSON files are the authoritative source and should be updated as new terms are finalized.
