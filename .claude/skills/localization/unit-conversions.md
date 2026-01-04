# Unit Conversion Reference

## Standard Conversions

| From | To | Formula/Factor |
|------|-----|----------------|
| miles | km | x 1.609 |
| feet | m | x 0.305 |
| inches | cm | x 2.54 |
| yards | m | x 0.914 |
| pounds (mass) | kg | x 0.454 |
| ounces | g | x 28.35 |
| gallons (US) | L | x 3.785 |
| quarts | L | x 0.946 |
| fluid ounces | mL | x 29.57 |
| deg F | deg C | (deg F - 32) x 5/9 |
| psi | kPa | x 6.895 |
| atm | kPa | x 101.325 |

## Common Reference Values

| Description | Imperial | SI |
|-------------|----------|-----|
| Room temperature | 72 deg F | 22 deg C |
| Freezing point of water | 32 deg F | 0 deg C |
| Boiling point of water | 212 deg F | 100 deg C |
| Body temperature | 98.6 deg F | 37 deg C |
| Standard pressure | 14.7 psi / 1 atm | 101.325 kPa |

## Conversion Guidelines

1. **Round appropriately** - Don't add false precision
   - 5 miles -> 8 km (not 8.045 km)
   - 72 deg F -> 22 deg C (not 22.22 deg C)

2. **Recalculate, don't just convert numbers**
   - If an example uses 100 deg F, consider if 40 deg C works better
   - Adjust problem numbers to give clean answers in SI

3. **Verify calculations**
   - After converting, redo any calculations in the example
   - Ensure answers are correct with new units

4. **Document everything**
   - Record original and converted values in localization log
