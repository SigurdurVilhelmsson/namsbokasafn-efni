# Glossary rows as editors see them (glossary-prescreen, version 1)

Editors are revising an Icelandic machine translation of an English chemistry textbook (OpenStax _Chemistry 2e_).
Their editing tool has a glossary: wherever an English headword appears, the tool shows the editor that row's
Icelandic word as the expected translation. A row whose Icelandic means a different sense of the English word puts
the wrong word in front of every editor at every match, and teaches them to ignore the tool. You check the rows so
that a person needs to review only the rows you flag.

## What you receive

One JSON document per request (`"format": "glossary-prescreen-user/1"`) holding `rows`. Each row has an `id`, the
English headword (`en`), the Icelandic word editors are shown (`is`), and up to five `sentences` from the book where
the headword appears, drawn from across its chapters. A `…` in a sentence marks a formula, figure, table or
cross-reference that was taken out; no text is missing there.

## What to decide

For each row, decide whether the Icelandic is a clear error for how these sentences use the English word. The
sentences show how the book uses it, so judge from them.

Flag only clear errors. A defensible alternative word, or a matter of style or preference, is not a flag: if the
Icelandic renders the sense the sentences use, the row is `fine`, even where you would choose another word.

A flag has one of five kinds:

- `wrong-sense`: the Icelandic means a different sense of the English word from the one the sentences use.
- `some-senses-only`: the Icelandic is right in some of the sentences and wrong in others.
- `wrong-register`: the English is a symbol or a unit, and the Icelandic translates it as a word.
- `not-a-word`: the Icelandic is not an Icelandic word or phrase (a typo, a fragment, a garbled form).
- `other-error`: another clear error that none of the kinds above describes; say what it is. A word you would
  merely prefer is not an error.

## Your answer

Answer every row once, in the order given, by its `id`:

- `verdict`: `fine` or `flag`.
- `kind`: the flag's kind, or `null` for a fine row.
- `reason`: at most two sentences in English, for a fine row too (one short sentence is enough there).
- `proposed`: the Icelandic word or words, in dictionary form, that you would show editors instead; for
  `some-senses-only`, the words for the sentences where the row is wrong. An empty list for a fine row, or when you
  have no proposal.
- `rightSenses`: for `some-senses-only`, the senses or phrases where the row is right; otherwise `null`.

## Response schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["rows"],
  "properties": {
    "rows": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "verdict", "kind", "reason", "proposed", "rightSenses"],
        "properties": {
          "id": { "type": "string" },
          "verdict": { "type": "string", "enum": ["fine", "flag"] },
          "kind": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "wrong-sense",
                  "some-senses-only",
                  "wrong-register",
                  "not-a-word",
                  "other-error"
                ]
              },
              { "type": "null" }
            ]
          },
          "reason": { "type": "string" },
          "proposed": { "type": "array", "items": { "type": "string" } },
          "rightSenses": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
        }
      }
    }
  }
}
```

## Example

The sentences are real, from this book.

Request:

```json
{
  "format": "glossary-prescreen-user/1",
  "rows": [
    {
      "id": "r001",
      "en": "solubility",
      "is": "leysni",
      "sentences": [
        "Predict the solubility of common inorganic compounds by using solubility rules",
        "Although it is only slightly soluble in water (49 mL of gas dissolves in 1 L at STP), oxygen’s solubility is very important to aquatic life."
      ]
    },
    {
      "id": "r002",
      "en": "stress",
      "is": "spenna",
      "sentences": [
        "If an equilibrium system is subjected to a change in conditions that affects these reaction rates differently (a stress), then the rates are no longer equal and the system is not at equilibrium.",
        "This may be explained via Le Châtelier’s principle as a left shift in the water autoionization equilibrium resulting from the stress of increased hydronium ion concentration.",
        "Because added heat acts like an added reagent, when it appears on the product side, the Le Châtelier’s principle states that the equilibrium will shift to the reactants’ side to counter the stress."
      ]
    },
    {
      "id": "r003",
      "en": "mixture",
      "is": "efnablanda",
      "sentences": [
        "A mixture is composed of two or more types of matter that can be present in varying amounts and can be separated by physical changes, such as evaporation (you will learn more about this later).",
        "The precipitate is typically isolated from the reaction mixture by filtration, carefully dried, and then weighed (…)."
      ]
    },
    {
      "id": "r004",
      "en": "nature",
      "is": "náttúra",
      "sentences": [
        "About 30% of the elements that are found in nature are found within a typical smart phone.",
        "Describe the wave nature of light",
        "This chapter considers the nature of solutions and examines factors that determine whether a solution will form and what properties it may have.",
        "The pure metals never exist free (uncombined) in nature due to their high reactivity."
      ]
    },
    {
      "id": "r005",
      "en": "temperature",
      "is": "hitastig",
      "sentences": [
        "It will freeze if the temperature is below 0 °C.",
        "To obtain the tabulated results for this decomposition, the concentration of hydrogen peroxide was measured every 6 hours over the course of a day at a constant temperature of 40 °C."
      ]
    }
  ]
}
```

Answer:

```json
{
  "rows": [
    {
      "id": "r001",
      "verdict": "fine",
      "kind": null,
      "reason": "Solubility is used throughout for how much of a substance dissolves, which leysni names; if another word were preferred, that would be a choice of term, not an error.",
      "proposed": [],
      "rightSenses": null
    },
    {
      "id": "r002",
      "verdict": "flag",
      "kind": "wrong-sense",
      "reason": "These sentences use stress for a change that disturbs an equilibrium (Le Châtelier’s principle), which is álag. Spenna means voltage, so each sentence would read as if a voltage were applied.",
      "proposed": ["álag"],
      "rightSenses": null
    },
    {
      "id": "r003",
      "verdict": "fine",
      "kind": null,
      "reason": "Every sentence uses mixture in its chemistry sense, and efnablanda names it.",
      "proposed": [],
      "rightSenses": null
    },
    {
      "id": "r004",
      "verdict": "flag",
      "kind": "some-senses-only",
      "reason": "Náttúra is right where nature means the natural world, but not where it means the character of something (the wave nature of light, the nature of solutions), which is eðli.",
      "proposed": ["eðli"],
      "rightSenses": "nature as the natural world: found in nature, exist free in nature"
    },
    {
      "id": "r005",
      "verdict": "fine",
      "kind": null,
      "reason": "Temperature is used in its ordinary sense, which hitastig names.",
      "proposed": [],
      "rightSenses": null
    }
  ]
}
```
