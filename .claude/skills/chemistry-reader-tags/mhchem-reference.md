# mhchem Quick Reference

Use `$\ce{...}$` for ALL chemical notation. Never use plain text or `$\text{...}$`.

## Basic Formulas

```markdown
$\ce{H2O}$          → H₂O
$\ce{H2SO4}$        → H₂SO₄
$\ce{Ca(OH)2}$      → Ca(OH)₂
$\ce{[Cu(NH3)4]^2+}$ → [Cu(NH₃)₄]²⁺
```

## Ions

```markdown
$\ce{Fe^3+}$        → Fe³⁺
$\ce{Fe^{3+}}$      → Fe³⁺ (alternative)
$\ce{SO4^2-}$       → SO₄²⁻
$\ce{OH-}$          → OH⁻
$\ce{e-}$           → e⁻ (electron)
```

## State Symbols

```markdown
$\ce{H2O(l)}$       → H₂O(l) — liquid
$\ce{NaCl(s)}$      → NaCl(s) — solid
$\ce{CO2(g)}$       → CO₂(g) — gas
$\ce{NaCl(aq)}$     → NaCl(aq) — aqueous
```

## Reaction Arrows

```markdown
$\ce{A -> B}$       → A → B (forward)
$\ce{A <- B}$       → A ← B (reverse)
$\ce{A <-> B}$      → A ↔ B (resonance)
$\ce{A <=> B}$      → A ⇌ B (equilibrium)
$\ce{A <=>> B}$     → A ⇌ B (equilibrium favors products)
$\ce{A <<=> B}$     → A ⇌ B (equilibrium favors reactants)
```

## Reaction Conditions

```markdown
$\ce{A ->[heat] B}$              → A --heat→ B
$\ce{A ->[{Pt}] B}$              → A --Pt→ B (catalyst)
$\ce{A ->[{350 °C}] B}$          → A --350 °C→ B
$\ce{A ->[{350 °C}][{2 atm}] B}$ → conditions above and below arrow
$\ce{A ->[\Delta] B}$            → A --Δ→ B (heat symbol)
```

## Precipitate and Gas Evolution

```markdown
$\ce{v}$            → ↓ (precipitate)
$\ce{^}$            → ↑ (gas evolution)

$\ce{AgNO3 + NaCl -> AgCl v + NaNO3}$
$\ce{CaCOite{3} + 2HCl -> CaCl2 + H2O + CO2 ^}$
```

## Stoichiometric Coefficients

```markdown
$\ce{2H2 + O2 -> 2H2O}$
$\ce{4Fe + 3O2 -> 2Fe2O3}$
$\ce{1/2 O2}$       → ½O₂ (fractions)
```

## Isotopes

```markdown
$\ce{^{14}C}$       → ¹⁴C
$\ce{^{238}_{92}U}$ → ²³⁸₉₂U
$\ce{^{2}H}$        → ²H (deuterium)
```

## Organic Chemistry

```markdown
$\ce{CH3-CH2-OH}$   → CH₃-CH₂-OH
$\ce{CH3CH2OH}$     → CH₃CH₂OH
$\ce{C6H5-}$        → C₆H₅- (phenyl)
```

## Oxidation States

```markdown
$\ce{Fe^{II}Fe^{III}2O4}$    → Fe(II)Fe(III)₂O₄
$\overset{+2}{\ce{Fe}}$       → Fe with +2 above
```

## Common Patterns

### Full Reaction Example

```markdown
$$\ce{2Na(s) + 2H2O(l) -> 2NaOH(aq) + H2(g) ^}$$ {#eq:sodium-water}
```

### Equilibrium with Constant

```markdown
Jafnvægisfastinn er: $K = \frac{[\ce{NO2}]^2}{[\ce{N2O4}]}$
```

### Half-Reactions

```markdown
**Oxun**: $\ce{Zn(s) -> Zn^2+(aq) + 2e-}$

**Afoxun**: $\ce{Cu^2+(aq) + 2e- -> Cu(s)}$
```

## Common Mistakes

| Wrong | Right |
|-------|-------|
| `H₂O` | `$\ce{H2O}$` |
| `$\text{H}_2\text{O}$` | `$\ce{H2O}$` |
| `H<sub>2</sub>O` | `$\ce{H2O}$` |
| `$H_2O$` | `$\ce{H2O}$` |
| `CO2` | `$\ce{CO2}$` |
| `Na+` | `$\ce{Na+}$` |

## Display vs Inline

```markdown
<!-- Inline (within text) -->
Vatn ($\ce{H2O}$) er lífsnauðsynlegt.

<!-- Display (centered, separate line) -->
$$\ce{2H2 + O2 -> 2H2O}$$
```

**Rule**: Use inline for formulas mentioned in text. Use display for important equations that should stand alone.
