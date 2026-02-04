## title: "Unknown" chapter: "unknown" module: "unknown" language: "en" part: "a"

<!-- SEG:m68690:title:auto-1 -->
Measurement Uncertainty, Accuracy, and Precision

<!-- SEG:m68690:abstract:auto-2 -->
By the end of this section, you will be able to:

<!-- SEG:m68690:abstract-item:abstract-item-1 -->
Define accuracy and precision

<!-- SEG:m68690:abstract-item:abstract-item-2 -->
Distinguish exact and uncertain numbers

<!-- SEG:m68690:abstract-item:abstract-item-3 -->
Correctly represent uncertainty in quantities using significant figures

<!-- SEG:m68690:abstract-item:abstract-item-4 -->
Apply proper rounding rules to computed quantities

<!-- SEG:m68690:para:fs-idm288863760 -->
Counting is the only type of measurement that is free from uncertainty, provided the number of objects being counted does not change while the counting process is underway. The result of such a counting measurement is an example of an __exact number__. By counting the eggs in a carton, one can determine *exactly* how many eggs the carton contains. The numbers of defined quantities are also exact. By definition, 1 foot is exactly 12 inches, 1 inch is exactly 2.54 centimeters, and 1 gram is exactly 0.001 kilogram. Quantities derived from measurements other than counting, however, are uncertain to varying extents due to practical limitations of the measurement process used.

<!-- SEG:m68690:title:fs-idm217277536-title -->
Significant Figures in Measurement

<!-- SEG:m68690:para:fs-idp11446448 -->
The numbers of measured quantities, unlike defined or directly counted quantities, are not exact. To measure the volume of liquid in a graduated cylinder, you should make a reading at the bottom of the meniscus, the lowest point on the curved surface of the liquid.

<!-- SEG:m68690:caption:fs-idm337865984-caption -->
To measure the volume of liquid in this graduated cylinder, you must mentally subdivide the distance between the 21 and 22 mL marks into tenths of a milliliter, and then make a reading (estimate) at the bottom of the meniscus.

<!-- SEG:m68690:para:fs-idm176542448 -->
Refer to the illustration in [#fs-idm337865984]. The bottom of the meniscus in this case clearly lies between the 21 and 22 markings, meaning the liquid volume is *certainly* greater than 21 mL but less than 22 mL. The meniscus appears to be a bit closer to the 22-mL mark than to the 21-mL mark, and so a reasonable estimate of the liquid’s volume would be 21.6 mL. In the number 21.6, then, the digits 2 and 1 are certain, but the 6 is an estimate. Some people might estimate the meniscus position to be equally distant from each of the markings and estimate the tenth-place digit as 5, while others may think it to be even closer to the 22-mL mark and estimate this digit to be 7. Note that it would be pointless to attempt to estimate a digit for the hundredths place, given that the tenths-place digit is uncertain. In general, numerical scales such as the one on this graduated cylinder will permit measurements to one-tenth of the smallest scale division. The scale in this case has 1-mL divisions, and so volumes may be measured to the nearest 0.1 mL.

<!-- SEG:m68690:para:fs-idm254904560 -->
This concept holds true for all measurements, even if you do not actively make an estimate. If you place a quarter on a standard electronic balance, you may obtain a reading of 6.72 g. The digits 6 and 7 are certain, and the 2 indicates that the mass of the quarter is likely between 6.71 and 6.73 grams. The quarter weighs *about* 6.72 grams, with a nominal uncertainty in the measurement of ± 0.01 gram. If the coin is weighed on a more sensitive balance, the mass might be 6.723 g. This means its mass lies between 6.722 and 6.724 grams, an uncertainty of 0.001 gram. Every measurement has some __uncertainty__, which depends on the device used (and the user’s ability). All of the digits in a measurement, including the uncertain last digit, are called __significant figures__ or __significant digits__. Note that zero may be a measured value; for example, if you stand on a scale that shows weight to the nearest pound and it shows “120,” then the 1 (hundreds), 2 (tens) and 0 (ones) are all significant (measured) values.

<!-- SEG:m68690:para:fs-idm264880544 -->
A measurement result is properly reported when its significant digits accurately represent the certainty of the measurement process. But what if you were analyzing a reported value and trying to determine what is significant and what is not? Well, for starters, all nonzero digits are significant, and it is only zeros that require some thought. We will use the terms “leading,” “trailing,” and “captive” for the zeros and will consider how to deal with them.

<!-- SEG:m68690:para:fs-idp31100592 -->
Starting with the first nonzero digit on the left, count this digit and all remaining digits to the right. This is the number of significant figures in the measurement unless the last digit is a trailing zero lying to the left of the decimal point.

<!-- SEG:m68690:para:fs-idm177076640 -->
Captive zeros result from measurement and are therefore always significant. Leading zeros, however, are never significant—they merely tell us where the decimal point is located.

<!-- SEG:m68690:para:fs-idm262013360 -->
The leading zeros in this example are not significant. We could use exponential notation (as described in Appendix B) and express the number as 8.32407 [[MATH:1]] 10^−3^; then the number 8.32407 contains all of the significant figures, and 10^−3^ locates the decimal point.

<!-- SEG:m68690:para:fs-idm210460000 -->
The number of significant figures is uncertain in a number that ends with a zero to the left of the decimal point location. The zeros in the measurement 1,300 grams could be significant or they could simply indicate where the decimal point is located. The ambiguity can be resolved with the use of exponential notation: 1.3 [[MATH:2]] 10^3^ (two significant figures), 1.30 [[MATH:3]] 10^3^ (three significant figures, if the tens place was measured), or 1.300 [[MATH:4]] 10^3^ (four significant figures, if the ones place was also measured). In cases where only the decimal-formatted number is available, it is prudent to assume that all trailing zeros are not significant.

<!-- SEG:m68690:para:fs-idm173917264 -->
When determining significant figures, be sure to pay attention to reported values and think about the measurement and significant figures in terms of what is reasonable or likely when evaluating whether the value makes sense. For example, the official January 2014 census reported the resident population of the US as 317,297,725. Do you think the US population was correctly determined to the reported nine significant figures, that is, to the exact number of people? People are constantly being born, dying, or moving into or out of the country, and assumptions are made to account for the large number of people who are not actually counted. Because of these uncertainties, it might be more reasonable to expect that we know the population to within perhaps a million or so, in which case the population should be reported as 3.17 [[MATH:5]] 10^8^ people.

<!-- SEG:m68690:title:fs-idm191691888-title -->
Significant Figures in Calculations

<!-- SEG:m68690:para:fs-idm277117616 -->
A second important principle of uncertainty is that results calculated from a measurement are at least as uncertain as the measurement itself. Take the uncertainty in measurements into account to avoid misrepresenting the uncertainty in calculated results. One way to do this is to report the result of a calculation with the correct number of significant figures, which is determined by the following three rules for __rounding__ numbers:

<!-- SEG:m68690:item:fs-idm65809616-item-1 -->
When adding or subtracting numbers, round the result to the same number of decimal places as the number with the least number of decimal places (the least certain value in terms of addition and subtraction).

<!-- SEG:m68690:item:fs-idm65809616-item-2 -->
When multiplying or dividing numbers, round the result to the same number of digits as the number with the least number of significant figures (the least certain value in terms of multiplication and division).

<!-- SEG:m68690:item:fs-idm65809616-item-3 -->
If the digit to be dropped (the one immediately to the right of the digit to be retained) is less than 5, “round down” and leave the retained digit unchanged; if it is more than 5, “round up” and increase the retained digit by 1. If the dropped digit is 5, and it’s either the last digit in the number or it’s followed only by zeros, round up or down, whichever yields an even value for the retained digit. If any nonzero digits follow the dropped 5, round up. (The last part of this rule may strike you as a bit odd, but it’s based on reliable statistics and is aimed at avoiding any bias when dropping the digit “5,” since it is equally close to both possible values of the retained digit.)

<!-- SEG:m68690:para:fs-idm107335696 -->
The following examples illustrate the application of this rule in rounding a few different numbers to three significant figures:

<!-- SEG:m68690:item:fs-idm192081680-item-1 -->
0.028675 rounds “up” to 0.0287 (the dropped digit, 7, is greater than 5)

<!-- SEG:m68690:item:fs-idm192081680-item-2 -->
18.3384 rounds “down” to 18.3 (the dropped digit, 3, is less than 5)

<!-- SEG:m68690:item:fs-idm192081680-item-3 -->
6.8752 rounds “up” to 6.88 (the dropped digit is 5, and a nonzero digit follows it)

<!-- SEG:m68690:item:fs-idm192081680-item-4 -->
92.85 rounds “down” to 92.8 (the dropped digit is 5, and the retained digit is even)

<!-- SEG:m68690:para:fs-idm178562592 -->
Let’s work through these rules with a few examples.

<!-- SEG:m68690:example-title:fs-idp40552528-title -->
Rounding Numbers

<!-- SEG:m68690:para:fs-idm303504976 -->
Round the following to the indicated number of significant figures:

<!-- SEG:m68690:para:fs-idm277227680 -->
(a) 31.57 (to two significant figures)

<!-- SEG:m68690:para:fs-idm113120528 -->
(b) 8.1649 (to three significant figures)

<!-- SEG:m68690:para:fs-idp33608880 -->
(c) 0.051065 (to four significant figures)

<!-- SEG:m68690:para:fs-idm208861552 -->
(d) 0.90275 (to four significant figures)

<!-- SEG:m68690:para-title:fs-idm125552432-title -->
Solution

<!-- SEG:m68690:para:fs-idm125552432 -->
(a) 31.57 rounds “up” to 32 (the dropped digit is 5, and the retained digit is even)

<!-- SEG:m68690:para:fs-idm180680048 -->
(b) 8.1649 rounds “down” to 8.16 (the dropped digit, 4, is less than 5)

<!-- SEG:m68690:para:fs-idm167789680 -->
(c) 0.051065 rounds “down” to 0.05106 (the dropped digit is 5, and the retained digit is even)

<!-- SEG:m68690:para:fs-idm174540832 -->
(d) 0.90275 rounds “up” to 0.9028 (the dropped digit is 5, and the retained digit is even)

<!-- SEG:m68690:para-title:fs-idm185983232-title -->
Check Your Learning

<!-- SEG:m68690:para:fs-idm185983232 -->
Round the following to the indicated number of significant figures:

<!-- SEG:m68690:para:fs-idm69923072 -->
(a) 0.424 (to two significant figures)

<!-- SEG:m68690:para:fs-idm65589936 -->
(b) 0.0038661 (to three significant figures)

<!-- SEG:m68690:para:fs-idm107300848 -->
(c) 421.25 (to four significant figures)

<!-- SEG:m68690:para:fs-idm258155488 -->
(d) 28,683.5 (to five significant figures)

<!-- SEG:m68690:para:fs-idm260724048 -->
(a) 0.42; (b) 0.00387; (c) 421.2; (d) 28,684

<!-- SEG:m68690:note-title:fs-idm155369456-title -->
Answer:

<!-- SEG:m68690:para:fs-idm260724048 -->
(a) 0.42; (b) 0.00387; (c) 421.2; (d) 28,684

<!-- SEG:m68690:example-title:fs-idp61408240-title -->
Addition and Subtraction with Significant Figures

<!-- SEG:m68690:para:fs-idm327587104 -->
Rule: When adding or subtracting numbers, round the result to the same number of decimal places as the number with the fewest decimal places (i.e., the least certain value in terms of addition and subtraction).

<!-- SEG:m68690:para:fs-idm318611824 -->
(a) Add 1.0023 g and 4.383 g.

<!-- SEG:m68690:para:fs-idm288438480 -->
(b) Subtract 421.23 g from 486 g.

<!-- SEG:m68690:para-title:fs-idm277651872-title -->
Solution

<!-- SEG:m68690:para:fs-idm21393952 -->
(a) [[MATH:6]]

<!-- SEG:m68690:para:fs-idm107330240 -->
Answer is 5.385 g (round to the thousandths place; three decimal places)

<!-- SEG:m68690:para:fs-idm257863024 -->
(b) [[MATH:7]]

<!-- SEG:m68690:para:fs-idp47889280 -->
Answer is 65 g (round to the ones place; no decimal places)

<!-- SEG:m68690:para-title:fs-idm97432976-title -->
Check Your Learning

<!-- SEG:m68690:para:fs-idm97432976 -->
(a) Add 2.334 mL and 0.31 mL.

<!-- SEG:m68690:para:fs-idm113279504 -->
(b) Subtract 55.8752 m from 56.533 m.

<!-- SEG:m68690:para:fs-idp40053216 -->
(a) 2.64 mL; (b) 0.658 m

<!-- SEG:m68690:note-title:fs-idp26956096-title -->
Answer:

<!-- SEG:m68690:para:fs-idp40053216 -->
(a) 2.64 mL; (b) 0.658 m

<!-- SEG:m68690:example-title:fs-idp34148976-title -->
Multiplication and Division with Significant Figures

<!-- SEG:m68690:para:fs-idm194335568 -->
Rule: When multiplying or dividing numbers, round the result to the same number of digits as the number with the fewest significant figures (the least certain value in terms of multiplication and division).

<!-- SEG:m68690:para:fs-idm176907440 -->
(a) Multiply 0.6238 cm by 6.6 cm.

<!-- SEG:m68690:para:fs-idp40092848 -->
(b) Divide 421.23 g by 486 mL.

<!-- SEG:m68690:para-title:fs-idm318303792-title -->
Solution

<!-- SEG:m68690:para:fs-idp11052048 -->
(a) [[MATH:8]]

<!-- SEG:m68690:para:fs-idm194468576 -->
(b) [[MATH:9]]

<!-- SEG:m68690:para-title:fs-idp45405152-title -->
Check Your Learning

<!-- SEG:m68690:para:fs-idp45405152 -->
(a) Multiply 2.334 cm and 0.320 cm.

<!-- SEG:m68690:para:fs-idm155228848 -->
(b) Divide 55.8752 m by 56.53 s.

<!-- SEG:m68690:para:fs-idm154957312 -->
(a) 0.747 cm^2^ (b) 0.9884 m/s

<!-- SEG:m68690:note-title:fs-idm282773952-title -->
Answer:

<!-- SEG:m68690:para:fs-idm154957312 -->
(a) 0.747 cm^2^ (b) 0.9884 m/s

<!-- SEG:m68690:para:fs-idp31178224 -->
In the midst of all these technicalities, it is important to keep in mind the reason for these rules about significant figures and rounding—to correctly represent the certainty of the values reported and to ensure that a calculated result is not represented as being more certain than the least certain value used in the calculation.

<!-- SEG:m68690:example-title:fs-idp40680240-title -->
Calculation with Significant Figures

<!-- SEG:m68690:para:fs-idm180409728 -->
One common bathtub is 13.44 dm long, 5.920 dm wide, and 2.54 dm deep. Assume that the tub is rectangular and calculate its approximate volume in liters.

<!-- SEG:m68690:para-title:fs-idm209075984-title -->
Solution

<!-- SEG:m68690:para-title:fs-idm219800928-title -->
Check Your Learning

<!-- SEG:m68690:para:fs-idm219800928 -->
What is the density of a liquid with a mass of 31.1415 g and a volume of 30.13 cm^3^?

<!-- SEG:m68690:para:fs-idm178106592 -->
1.034 g/mL

<!-- SEG:m68690:note-title:fs-idm178680064-title -->
Answer:

<!-- SEG:m68690:para:fs-idm178106592 -->
1.034 g/mL

<!-- SEG:m68690:example-title:fs-idm148976192-title -->
Experimental Determination of Density Using Water Displacement

<!-- SEG:m68690:para:fs-idp29940656 -->
A piece of rebar is weighed and then submerged in a graduated cylinder partially filled with water, with results as shown.

<!-- SEG:m68690:para:fs-idm245394240 -->
(a) Use these values to determine the density of this piece of rebar.

<!-- SEG:m68690:para:fs-idm209220496 -->
(b) Rebar is mostly iron. Does your result in (a) support this statement? How?

<!-- SEG:m68690:para-title:fs-idm325787440-title -->
Solution

<!-- SEG:m68690:para:fs-idm325787440 -->
The volume of the piece of rebar is equal to the volume of the water displaced:

<!-- SEG:m68690:para:fs-idm181276752 -->
(rounded to the nearest 0.1 mL, per the rule for addition and subtraction)

<!-- SEG:m68690:para:fs-idp36085040 -->
The density is the mass-to-volume ratio:

<!-- SEG:m68690:para:fs-idm277303296 -->
(rounded to two significant figures, per the rule for multiplication and division)

<!-- SEG:m68690:para:fs-idm243666944 -->
From [#fs-idm45639696], the density of iron is 7.9 g/cm^3^, very close to that of rebar, which lends some support to the fact that rebar is mostly iron.

<!-- SEG:m68690:para-title:fs-idm259990592-title -->
Check Your Learning

<!-- SEG:m68690:para:fs-idm259990592 -->
An irregularly shaped piece of a shiny yellowish material is weighed and then submerged in a graduated cylinder, with results as shown.

<!-- SEG:m68690:para:fs-idm272657872 -->
(a) Use these values to determine the density of this material.

<!-- SEG:m68690:para:fs-idm166920160 -->
(b) Do you have any reasonable guesses as to the identity of this material? Explain your reasoning.

<!-- SEG:m68690:para:fs-idm287839728 -->
(a) 19 g/cm^3^; (b) It is likely gold; the right appearance for gold and very close to the density given for gold in [#fs-idm45639696].

<!-- SEG:m68690:note-title:fs-idm113054800-title -->
Answer:

<!-- SEG:m68690:para:fs-idm287839728 -->
(a) 19 g/cm^3^; (b) It is likely gold; the right appearance for gold and very close to the density given for gold in [#fs-idm45639696].

<!-- SEG:m68690:title:fs-idp33954960-title -->
Accuracy and Precision

<!-- SEG:m68690:para:fs-idp4474304 -->
Scientists typically make repeated measurements of a quantity to ensure the quality of their findings and to evaluate both the __precision__ and the __accuracy__ of their results. Measurements are said to be precise if they yield very similar results when repeated in the same manner. A measurement is considered accurate if it yields a result that is very close to the true or accepted value. Precise values agree with each other; accurate values agree with a true value. These characterizations can be extended to other contexts, such as the results of an archery competition ([#fs-idm1827280]).