---
title: "MT Syntax Survival Test Document"
chapter: 99
section: "99.1"
translation-status: "Untranslated - Test File"
module-id: "m00000"
---

# MT Syntax Survival Test Document

This document contains all syntax patterns used in the namsbokasafn-efni content pipeline. It is designed to test how each pattern survives machine translation through Erlendur (malstadur.is).

**TEST MARKER: START OF DOCUMENT**

---

## 1. Directive Blocks (All Types)

### 1.1 Learning Objectives

:::learning-objectives
- Understand the basic principles of chemistry
- Apply chemical formulas to real-world problems
- Analyze experimental data effectively
:::

### 1.2 Example Block

:::example
### Example: Calculating Molar Mass

To calculate the molar mass of water (H~2~O), add the atomic masses:
- Hydrogen: 2 × 1.008 = 2.016
- Oxygen: 1 × 16.00 = 16.00
- Total: 18.016 g/mol

This example contains **bold text** and *italic text*.
:::

### 1.3 Practice Problem with Answer

:::practice-problem{#prob-001}
Calculate the number of moles in 36.0 g of water.

:::answer
Using the molar mass of water (18.016 g/mol):
n = 36.0 g ÷ 18.016 g/mol = 2.00 mol
:::
:::

### 1.4 Note Block

:::note
Important: Always balance chemical equations before performing calculations.
:::

### 1.5 Warning Block

:::warning
Caution: Some chemicals are hazardous. Always wear proper safety equipment.
:::

### 1.6 Chemistry Everyday Block

:::chemistry-everyday
### Chemistry in Daily Life

The chemistry of baking involves the reaction of baking soda (NaHCO~3~) with acids to produce carbon dioxide gas, which makes bread rise.
:::

### 1.7 Scientist Spotlight Block

:::scientist-spotlight
### Marie Curie (1867-1934)

Marie Curie was a pioneering physicist and chemist who discovered polonium and radium. She was the first woman to win a Nobel Prize.
:::

### 1.8 Link to Material Block

:::link-to-material
For more information on atomic structure, see the resources at the end of this chapter.
:::

**TEST MARKER: END OF DIRECTIVE BLOCKS**

---

## 2. Link Syntax (MT-Safe Format)

### 2.1 External URLs

External link with URL: [Visit OpenStax]{url="https://openstax.org/books/chemistry-2e/pages/1-introduction"}

Link with query parameters: [Search Example]{url="https://example.com/search?q=chemistry&lang=en"}

### 2.2 Internal References

Figure reference: [Figure 1.1]{ref="CNX_Chem_01_01_Chem2e"}

Equation reference: [Equation 2.5]{ref="equation-2-5"}

Table reference: [Table 3.2]{ref="table-03-02"}

### 2.3 Document Cross-References

Chapter cross-reference: [Chapter on Matter]{doc="m68724"}

Section cross-reference: [Energy and Work]{doc="m68700" anchor="section-2"}

### 2.4 Standard Markdown Links (for comparison)

Standard link: [Standard markdown link](https://example.com)

Link with title: [Link with title](https://example.com "Example Title")

**TEST MARKER: END OF LINK SYNTAX**

---

## 3. Equation Placeholders

Inline equation: The ideal gas law [[EQ:1]] describes the relationship between pressure, volume, and temperature.

Multiple equations: The equations [[EQ:2]] and [[EQ:3]] can be combined to derive [[EQ:4]].

Equation with ID: The quadratic formula [[EQ:5]]{id="equation-quadratic"} is essential for solving second-degree polynomials.

Display equation placeholder:

[[EQ:6]]

**TEST MARKER: END OF EQUATION PLACEHOLDERS**

---

## 4. Image Attribute Blocks

{id="CNX_Chem_01_01_TestImage" class="scaled-down" alt="A test image showing chemical apparatus in a laboratory setting"}

{id="CNX_Chem_01_02_MultiLine" class="full-width" alt="An image with a longer alt text
that spans multiple lines to test
how multiline attributes are handled"}

{id="CNX_Chem_01_03_NoClass" alt="Simple image without class attribute"}

**TEST MARKER: END OF IMAGE ATTRIBUTES**

---

## 5. Figure Captions

*Mynd 1.1: Efnafræðileg tækni í rannsóknarstofu*{id="fig-1-1"}

*Figure 1.2: Chemical equipment showing beakers and flasks*{id="fig-1-2"}

*Figure 1.3: Caption with special characters: H₂O, Na⁺, CO₂*{id="fig-1-3"}

*Figure 1.4: Caption with subscript H~2~O and superscript 10^-3^*{id="fig-1-4"}

**TEST MARKER: END OF FIGURE CAPTIONS**

---

## 6. Term Definitions

The study of **chemistry**{id="term-00001"} involves understanding matter and its transformations.

A **molecule**{id="term-00002"} is the smallest unit of a compound that retains its properties.

The Icelandic term **efnafræði**{id="term-00003"} means chemistry.

A **sameind**{id="term-00004"} (molecule in Icelandic) consists of bonded atoms.

**TEST MARKER: END OF TERM DEFINITIONS**

---

## 7. Tables with Attributes

### 7.1 Basic Table with Alignment

| Element | Symbol | Atomic Number |
| :--- | :---: | ---: |
| Hydrogen | H | 1 |
| Helium | He | 2 |
| Lithium | Li | 3 |
| Carbon | C | 6 |
{id="table-001" summary="Basic elements table with left, center, and right alignment"}

### 7.2 Table with Chemical Formulas

| Compound | Formula | Molar Mass |
| :--- | :--- | ---: |
| Water | H~2~O | 18.015 |
| Carbon dioxide | CO~2~ | 44.01 |
| Sodium chloride | NaCl | 58.44 |
{id="table-002" summary="Common compounds with formulas using subscript notation"}

**TEST MARKER: END OF TABLES**

---

## 8. Subscripts and Superscripts

### 8.1 Chemical Formulas

Water: H~2~O

Carbon dioxide: CO~2~

Sulfuric acid: H~2~SO~4~

Glucose: C~6~H~12~O~6~

### 8.2 Ions

Sodium ion: Na^+^

Chloride ion: Cl^-^

Calcium ion: Ca^2+^

Phosphate ion: PO~4~^3-^

### 8.3 Isotope Notation

Carbon-14: ^14^C

Uranium-235: ^235^U

Combined notation: _{6}^{14}C

### 8.4 Numeric Exponents

Scientific notation: 10^-3^

Large numbers: 2^10^ = 1024

Avogadro's number: 6.022 × 10^23^

**TEST MARKER: END OF SUBSCRIPTS AND SUPERSCRIPTS**

---

## 9. Math Delimiters

### 9.1 Inline Math

The energy equation $E = mc^2$ shows mass-energy equivalence.

The area of a circle is $A = \pi r^2$.

### 9.2 Display Math

The quadratic formula:

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

The ideal gas law:

$$
PV = nRT
$$

Chemical equilibrium:

$$
K_{eq} = \frac{[C]^c[D]^d}{[A]^a[B]^b}
$$

**TEST MARKER: END OF MATH DELIMITERS**

---

## 10. Special Characters & Encoding

### 10.1 Icelandic Characters

Lowercase: á é í ó ú ý þ ð æ ö

Uppercase: Á É Í Ó Ú Ý Þ Ð Æ Ö

Words: Þetta er íslenskur texti með sérstökum stöfum.

### 10.2 Mathematical Symbols

Arrows: → ← ↔ ⇌ ↑ ↓

Comparisons: ≠ ≤ ≥ ≈ ≡

Operations: ± × ÷ · ∓

Other: ° ∞ ∑ ∫ √ ∂ ∆ ∇

### 10.3 Unicode Superscripts and Subscripts

Superscripts: ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁿ

Subscripts: ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ₊ ₋

### 10.4 Greek Letters

Lowercase: α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω

Uppercase: Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω

### 10.5 Chemical Notation

Reaction arrow: A + B → C + D

Equilibrium: A + B ⇌ C + D

Precipitate: ↓

Gas evolution: ↑

**TEST MARKER: END OF SPECIAL CHARACTERS**

---

## 11. Nested/Complex Structures

:::example
### Complex Example: Stoichiometry

This example demonstrates nested structures and multiple syntax elements.

The combustion of methane follows [[EQ:7]]:

| Reactant/Product | Moles | Mass (g) |
| :--- | :---: | ---: |
| CH~4~ | 1 | 16.04 |
| O~2~ | 2 | 64.00 |
| CO~2~ | 1 | 44.01 |
| H~2~O | 2 | 36.03 |
{id="table-combustion" summary="Stoichiometry of methane combustion"}

For more details, see [the section on combustion]{doc="m68750"}.

:::practice-problem{#nested-prob-001}
If 32.0 g of CH~4~ reacts completely, how many grams of H~2~O are produced?

:::answer
From the balanced equation:
- Moles of CH~4~: 32.0 g ÷ 16.04 g/mol = 2.00 mol
- Moles of H~2~O: 2.00 mol × 2 = 4.00 mol
- Mass of H~2~O: 4.00 mol × 18.015 g/mol = **72.1 g**

See [Figure 1.5]{ref="CNX_Chem_01_05_Combustion"} for a diagram.
:::
:::

*Figure 1.5: The combustion process showing CH~4~ + 2O~2~ → CO~2~ + 2H~2~O*{id="fig-1-5"}
:::

### 11.1 Deeply Nested Warning

:::note
This note contains important information.

:::warning
This warning is nested inside a note block.

The equation [[EQ:8]] should be handled with care.
:::

Always double-check your calculations.
:::

**TEST MARKER: END OF NESTED STRUCTURES**

---

## 12. Edge Cases

### 12.1 Empty Directive

:::note
:::

### 12.2 Directive with Only Whitespace

:::example

:::

### 12.3 Back-to-Back Directives

:::note
First note.
:::
:::warning
Immediate warning after note.
:::

### 12.4 Link at End of Sentence

For more information, see [the documentation]{url="https://example.com"}.

### 12.5 Multiple Inline Elements

This sentence has **bold**, *italic*, H~2~O, 10^-3^, and [[EQ:9]] all together.

### 12.6 Punctuation After Syntax

The compound H~2~O, which is water, is essential.

The ion Na^+^; it is positively charged.

See [reference]{ref="fig-1-1"}: for details.

**TEST MARKER: END OF EDGE CASES**

---

## 13. Full Paragraph Context

In chemistry, we study the composition, structure, and properties of matter. Water (H~2~O) is one of the most important **molecules**{id="term-00005"} studied. Its unique properties arise from the polar covalent bonds between hydrogen and oxygen atoms.

The formation of water can be represented by the equation [[EQ:10]], where hydrogen gas reacts with oxygen gas. This reaction is highly exothermic, releasing approximately 286 kJ/mol of energy. For more details on thermochemistry, see [Chapter 5]{doc="m68800"}.

:::practice-problem{#context-prob-001}
Calculate the energy released when 4.0 mol of H~2~ reacts with excess O~2~ according to [[EQ:10]].

:::answer
Energy = 4.0 mol × 286 kJ/mol ÷ 2 = **572 kJ**

(We divide by 2 because the equation shows 2 mol H~2~ per reaction.)
:::
:::

*Figure 1.6: Energy diagram for the formation of water from H~2~ and O~2~*{id="fig-1-6"}

**TEST MARKER: END OF FULL PARAGRAPH CONTEXT**

---

## Summary

This document tests the following syntax patterns:

1. ✓ Directive blocks (8 types)
2. ✓ Link syntax (4 variations)
3. ✓ Equation placeholders
4. ✓ Image attributes
5. ✓ Figure captions
6. ✓ Term definitions
7. ✓ Tables with attributes
8. ✓ Subscripts and superscripts
9. ✓ Math delimiters
10. ✓ Special characters
11. ✓ Nested structures
12. ✓ Edge cases
13. ✓ Full paragraph context

**TEST MARKER: END OF DOCUMENT**
