# mhchem Chemical Notation Reference

Use `\ce{}` command for all chemical notation. Much simpler than manual subscripts!

## Basic Formulas

```markdown
$\ce{H2O}$           -> H2O
$\ce{H2SO4}$         -> H2SO4
$\ce{Fe2O3}$         -> Fe2O3
$\ce{Ca(OH)2}$       -> Ca(OH)2
```

## Ions

```markdown
$\ce{Fe^3+}$         -> Fe3+
$\ce{SO4^2-}$        -> SO4 2-
$\ce{Na+}$           -> Na+
$\ce{Cl-}$           -> Cl-
```

## States of Matter

```markdown
$\ce{H2O(l)}$        -> H2O(l)   liquid
$\ce{NaCl(s)}$       -> NaCl(s)  solid
$\ce{CO2(g)}$        -> CO2(g)   gas
$\ce{NaCl(aq)}$      -> NaCl(aq) aqueous
```

## Reaction Arrows

```markdown
$\ce{A -> B}$        -> forward reaction
$\ce{A <- B}$        -> reverse reaction
$\ce{A <=> B}$       -> equilibrium
$\ce{A <-> B}$       -> resonance
```

## Reactions with Conditions

```markdown
$\ce{A ->[heat] B}$           -> with heat
$\ce{A ->[H2SO4] B}$          -> with catalyst
$\ce{A ->[\Delta] B}$         -> with heat (delta)
$\ce{A ->[catalyst][heat] B}$ -> above and below arrow
```

## Complete Equation Examples

```markdown
**Combustion:**
$$\ce{CH4(g) + 2O2(g) -> CO2(g) + 2H2O(l)}$$

**Equilibrium:**
$$\ce{N2(g) + 3H2(g) <=> 2NH3(g)}$$

**Acid-base:**
$$\ce{HCl(aq) + NaOH(aq) -> NaCl(aq) + H2O(l)}$$
```

## Special Notation

```markdown
$\ce{AgCl v}$        -> precipitate (down arrow)
$\ce{CO2 ^}$         -> gas evolution (up arrow)
$\ce{Fe^2+ -> Fe^3+ + e-}$  -> electron transfer
```

## Why mhchem?

Compare:
```markdown
Old: $\text{H}_2\text{SO}_4$
New: $\ce{H2SO4}$
```

Always use mhchem. It's cleaner, easier to read, and less error-prone.
