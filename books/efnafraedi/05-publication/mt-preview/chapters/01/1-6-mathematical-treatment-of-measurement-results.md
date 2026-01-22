---
title: "Stærðfræðileg meðferð á niðurstöðum mælinga"
section: "1.6"
chapter: 1
translation-status: Vélþýðing - ekki yfirfarin
publication-track: mt-preview
---


# Stærðfræðileg meðferð á niðurstöðum mælinga

:::learning-objectives

## Námstakmarkmið

Í lok þessa kafla muntu geta:

- Útskýrt einingagreiningu (þáttamerkingaraðferð) sem nálgun við
  stærðfræðilega útreikninga sem fela í sér stærðir

- Notað einingagreiningu til að framkvæma einingabreytingar fyrir
  tiltekinn eiginleika og útreikninga sem fela í sér tvo eða fleiri
  eiginleika :::

Oft er það svo að stærð sem vekur áhuga er ekki auðvelt (eða jafnvel
mögulegt) að mæla beint, heldur verður að reikna hana út frá öðrum beint
mældum eiginleikum og viðeigandi stærðfræðilegum samböndum. Tökum sem
dæmi mælingu á meðalhraða íþróttamanns sem hleypur spretti. Þetta er
venjulega gert með því að mæla *tímann* sem það tekur íþróttamanninn að
hlaupa frá ráslínu að marklínu, og *vegalengdina* milli þessara tveggja
lína, og síðan reikna út *hraða* út frá jöfnunni sem tengir þessa þrjá
eiginleika:

$${\text{speed}=\,\frac{{\text{distance}}}{{\text{time}}}}$${#fs-idm290867056}

Spretthlaupari á Ólympíugæðum getur hlaupið 100 m á um það bil 10 s, sem
samsvarar meðalhraða upp á

$${\frac{{\text{100 m}}}{{\text{10 s}}}\,=\text{10 m/s}}$${#fs-idm257675424}

(Fyrir þennan og næsta útreikning, gerum ráð fyrir að núllin aftast séu
markverðir stafir.) Athugið að þessi einfalda reikningsaðgerð felur í
sér að deila tölum hverrar mældrar stærðar til að fá tölu reiknuðu
stærðarinnar (100/10 = 10) *og sömuleiðis* að deila einingum hverrar
mældrar stærðar til að fá einingu reiknuðu stærðarinnar (m/s = m/s).
Íhugið nú að nota þetta sama samband til að spá fyrir um þann tíma sem
það tekur mann sem hleypur á þessum hraða að fara 25 m vegalengd. Sama
samband milli þessara þriggja eiginleika er notað, en í þessu tilfelli
eru stærðirnar tvær sem gefnar eru hraði (10 m/s) og vegalengd (25 m).
Til að fá út þann eiginleika sem leitað er að, tíma, verður að umraða
jöfnunni á viðeigandi hátt:

$${\text{time}=\,\frac{{\text{distance}}}{{\text{speed}}}}$${#fs-idm219214640}

Þá er hægt að reikna tímann út sem:

$${\frac{{\text{25 m}}}{{\text{10 m/s}}}\,=\text{2.5 s}}$${#fs-idp106016944}

Aftur fylgdi reikningsaðgerð á tölunum (25/10 = 2,5) samsvarandi
reikningsaðgerð á einingunum (m/(m/s) = s) til að fá tölu og einingu
niðurstöðunnar, 2,5 s. Athugið að, rétt eins og með tölur, þegar einingu
er deilt með sams konar einingu (í þessu tilfelli, m/m), er niðurstaðan
„1“ — eða, eins og almennt er orðað, einingarnar „stytta sig út“.

Þessir útreikningar eru dæmi um fjölhæfa stærðfræðilega nálgun sem
kallast **einingagreining**{#term-00001} (eða
**þáttamerkingaraðferðin**{#term-00002}). Einingagreining byggir á
þessari forsendu: *einingar stærða verða að lúta sömu stærðfræðilegu
aðgerðum og tilheyrandi tölur þeirra*. Þessa aðferð má beita á
útreikninga allt frá einföldum einingabreytingum til flóknari, margra
þrepa útreikninga sem fela í sér nokkrar mismunandi stærðir.

## Umreikningsstuðlar og einingagreining

Hlutfall tveggja jafngildra stærða sem gefnar eru upp með mismunandi
mælieiningum má nota sem **umreikningsstuðul fyrir
einingar**{#term-00003}. Til dæmis eru lengdirnar 2,54 cm og 1
tommur jafngildar (samkvæmt skilgreiningu), og því má leiða út
umreikningsstuðul fyrir einingar úr hlutfallinu,

$${\frac{{\text{2.54 cm}}}{{\text{1 in.}}}\,\text{(2.54 cm}=\text{1 in.) or 2.54}\,\frac{{\text{cm}}}{{\text{in.}}}}$${#fs-idm256748160}

Nokkrir aðrir algengir umreikningsstuðlar eru gefnir í
\[↗\](#fs-idm222237232).

**Algengir umreikningsstuðlar**

| Lengd | Rúmmál | Massi | | :--- | :--- | :--- | | 1 m = 1,0936 yd | 1
L = 1,0567 qt | 1 kg = 2,2046 lb | | 1 tommur = 2,54 cm (nákvæmlega) | 1
qt = 0,94635 L | 1 lb = 453,59 g | | 1 km = 0,62137 mílur | 1 ft^3^ =
28,317 L | 1 (avoirdupois) oz = 28,349 g | | 1 míla = 1609,3 m | 1 msk =
14,787 ml | 1 (troy) oz = 31,103 g | {id="fs-idm222237232"
summary="Þessi tafla er skipt í 3 dálka. Þeir heita lengd, rúmmál og
massi. Eftirfarandi einingar eru undir lengdardálknum: 1 metri er jafnt
og 1,0936 yardar, 1 tommur er jafnt og 2,54 cm, 1 kílómetri er jafnt og
0,62137 mílur, 1 míla er jafnt og 1609,3 metrar. Eftirfarandi einingar
eru undir rúmmálsdálknum: 1 lítri er jafnt og 1,0567 kvart, 1 kvart er
jafnt og 0,94635 lítrar, ein rúmfet er jafnt og 28,317 lítrar, 1
matskeið er jafnt og 14,787 millilítrar. Eftirfarandi einingar eru undir
massadálknum: 1 kílógramm er jafnt og 2,2046 pund, 1 pund er jafnt og
453,59 grömm, 1 avoirdupois únsa er jafnt og 28,349 grömm, 1 troy únsa
er jafnt og 31,103 grömm."}

\[^fs-idm222237232-1\]: Strangt til tekið eru únsa og pund einingar
fyrir þyngd, *W* (kraftur sem er jafn margfeldi massa og
þyngdarhröðunar, *W* = *mg*)"

. Umreikningssamböndin í þessari töflu eru almennt notuð til að jafna
massa og þyngd með því að gera ráð fyrir nafnvirði fyrir *g* á yfirborði
jarðar.

Þegar stærð (eins og fjarlægð í tommum) er margfölduð með viðeigandi
umreikningsstuðli fyrir einingar er stærðinni breytt í jafngilt gildi
með öðrum einingum (eins og fjarlægð í sentímetrum). Til dæmis er hægt
að breyta 34 tommu lóðréttu stökki körfuboltaleikmanns í sentímetra með
því að:

$${34\,{\text{in.}}\,\times \,\frac{{\text{2.54 cm}}}{{1\,{\text{in.}}}}\,=\text{86 cm}}$${#fs-idm153590912}

Þar sem þessi einfalda reikningsaðgerð felur í sér *stærðir* krefst
forsenda einingagreiningar þess að við margföldum bæði *tölur og
einingar*. Tölur þessara tveggja stærða eru margfaldaðar saman til að fá
tölu myndefnisstærðarinnar, 86, en einingarnar eru margfaldaðar saman
til að fá ${\frac{{\text{in.}\,\times \,\text{cm}}}{{\text{in.}}}}$. Rétt eins og með tölur er hlutfall eins eininga
einnig tölulega jafnt og einn, ${\frac{{\text{in.}}}{{\text{in.}}}\,=\text{1,}}$ og einingamargfeldið
einfaldast því í *cm*. (Þegar eins einingar deilast og gefa stuðulinn 1
er sagt að þær „styttist út“.) Einingagreiningu má nota til að staðfesta
rétta notkun umreikningsstuðla fyrir einingar eins og sýnt er í
eftirfarandi dæmi.

::: example

### Dæmi 1.6: Notkun umreikningsstuðuls fyrir einingar

Massi keppnisfrisbídisks er 125 g. Umreiknaðu massa hans í únsur með því
að nota umreikningsstuðulinn fyrir einingar sem er fenginn úr sambandinu
1 oz = 28,349 g (\[↑\](#fs-idm222237232)).

**Lausn**

Miðað við umreikningsstuðulinn má finna massann í únsum með jöfnu
svipaðri þeirri sem notuð var til að umreikna lengd úr tommum í
sentímetra.

${x\,\text{oz}=\text{125 g}\,\times \,\text{unit conversion factor}}${#fs-idm138056288}

Umreikningsstuðulinn fyrir einingar má tákna sem:

$${\frac{{\text{1 oz}}}{{\text{28.349 g}}}\,\text{and}\,\frac{{\text{28.349 g}}}{{\text{1 oz}}}}$${#fs-idm233281680}

Rétti umreikningsstuðullinn fyrir einingar er hlutfallið sem styttir út
eininguna grömm og skilur eftir únsur.

$${x\,\text{oz}}=125\,\text{g}\,\times \,\frac{{\text{1 oz}}}{{\text{28.349}\,\text{g}}}{=}(\frac{{125}}{{\text{28.349}}})\,\text{oz}=\text{4.41 oz (three significant figures)}$${#fs-idm222314304}

**Skoðaðu þekkingu þína**

Umreiknaðu rúmmál upp á 9,345 qt í lítra.

8,844 L

:::

:::note

### Svar:

8,844 L

:::

Fyrir utan einfaldar einingaumreikningar er hægt að nota stuðla-merkja
aðferðina til að leysa flóknari verkefni sem fela í sér útreikninga.
Burtséð frá smáatriðum er grundvallaraðferðin sú sama – allir *stuðlar*
sem koma við sögu í útreikningnum verða að vera rétt stilltir upp til að
tryggja að *merki* þeirra (einingar) styttist út og/eða sameinist á
viðeigandi hátt til að gefa þá einingu sem óskað er eftir í
niðurstöðunni. Eftir því sem þú heldur áfram í efnafræðináminu muntu fá
mörg tækifæri til að beita þessari aðferð.

::: example

### Dæmi 1.7: Útreikningur stærða út frá niðurstöðum mælinga og þekktum stærðfræðilegum samböndum

Hver er eðlismassi algengs frostlagar í einingum g/ml? 4,00 qt sýni af
frostlöginum vegur 9,26 lb.

**Lausn**

Þar sem ${\text{density}\,=\,\frac{{\text{mass}}}{{\text{volume}}}}$ þurfum við að deila massanum í grömmum með
rúmmálinu í millilítrum. Almennt gildir: fjöldi eininga B = fjöldi
eininga A $\times$ umreikningsstuðull fyrir einingar. Nauðsynlegir
umreikningsstuðlar eru gefnir í \[↑\](#fs-idm222237232): 1 lb =
453,59 g; 1 L = 1,0567 qt; 1 L = 1.000 ml. Hægt er að umreikna massa úr
pundum í grömm á eftirfarandi hátt:

$${\text{9.26}\,{\text{lb}}\,\times \,\frac{{\text{453.59 g}}}{{1\,{\text{lb}}}}\,=4.20\,\times \,{{10}}^{3}}\,\text{g}$${#fs-idm336821696}

Hægt er að umreikna rúmmál úr kvörtum í millilítra í tveimur skrefum:

$${\text{4.00}\,{\text{qt}}\,\times \,\frac{{\text{1 L}}}{{\text{1.0567}\,{\text{qt}}}}\,=\text{3.78 L}}$${#fs-idm279137456}

$${\text{3.78}\,\text{L}\,\times \,\frac{{\text{1000 mL}}}{{1\,\text{L}}}\,=3.78\,\times \,{{10}}^{3}\,\text{mL}}$${#fs-idm289883088}

Þá,

$${\text{density}=\,\frac{{\text{4.20}\,\times \,{{10}}^{3}\,\text{g}}}{{3.78\,\times \,{{10}}^{3}\,\text{mL}}}\,=\text{1.11 g/mL}}$${#fs-idm144640128}

Að öðrum kosti væri hægt að setja útreikninginn upp á þann hátt að þrír
umreikningsstuðlar fyrir einingar séu notaðir í röð á eftirfarandi hátt:

$${\frac{{\text{9.26}\,{\text{lb}}}}{{\text{4.00}\,{\text{qt}}}}\,\times \,\frac{{\text{453.59 g}}}{{1\,{\text{lb}}}}\,\times \,\frac{{\text{1.0567}\,{\text{qt}}}}{{1\,\text{L}}}\,\times \,\frac{{1\,\text{L}}}{{\text{1000 mL}}}\,=\text{1.11 g/mL}}$${#fs-idm9873904}

**Skoðaðu þekkingu þína**

Hvert er rúmmálið í lítrum af 1,000 oz, að því gefnu að 1 L = 1,0567 qt
og 1 qt = 32 oz (nákvæmlega)?

2,957 × 10^−2^ L

:::

:::note

### Svar:

2,957 × 10^−2^ L

:::

::: example

### Dæmi 1.8: Útreikningur á magni út frá niðurstöðum mælinga og þekktum stærðfræðilegum tengslum

Á leiðinni frá Fíladelfíu til Atlanta, um 1250 km vegalengd, eyðir 2014
árgerð af Lamborghini Aventador Roadster 213 L af bensíni.

\(a\) Hver var (meðal)eyðsla sportbílsins í þessari ferð, mæld í mílum á
galloni?

\(b\) Ef bensín kostar 3,80 $ á gallonið, hver var
eldsneytiskostnaðurinn fyrir þessa ferð?

**Lausn**

\(a\) Fyrst er vegalengdinni breytt úr kílómetrum í mílur:

$${1250\,\text{km}\,\times \,\frac{{\text{0.62137 mi}}}{{1\,\text{km}}}\,=\text{777 mi}}$${#fs-idm60362224}

og síðan er rúmmálinu breytt úr lítrum í gallon:

$${213\,\text{L}\,\times \,\frac{{\text{1.0567}\,{\text{qt}}}}{{1\,\text{L}}}\,\times \,\frac{{\text{1 gal}}}{{4\,{\text{qt}}}}\,=\text{56.3 gal}}$${#fs-idm214696672}

Að lokum,

$${\text{(average) mileage}=\,\frac{{\text{777 mi}}}{{\text{56.3 gal}}}\,=\text{13.8 miles/gallon}=\text{13.8 mpg}}$${#fs-idm114266320}

Einnig væri hægt að setja útreikninginn upp þannig að allir
umreikningsstuðlar séu notaðir í röð, eins og hér segir:

$${\frac{{1250\,{\text{km}}}}{{213\,\text{L}}}\,\times \,\frac{{\text{0.62137 mi}}}{{1\,{\text{km}}}}\,\times \,\frac{{1\,\text{L}}}{{\text{1.0567}\,{\text{qt}}}}\,\times \,\frac{{4\,{\text{qt}}}}{{\text{1 gal}}}=\text{13.8 mpg}}$${#fs-idm171836160}

\(b\) Með því að nota áður útreiknað rúmmál í gallonum finnum við:

$${56.3\,\text{gal}\,\times \,\frac{{\text{$3.80}}}{{1\,\text{gal}}}=\text{$214}}$${#fs-idm328491840}

**Skoðaðu eigin skilning**

Toyota Prius Hybrid eyðir 59,7 L af bensíni til að aka frá San Francisco
til Seattle, 1300 km vegalengd (tvær markverðar tölur).

\(a\) Hver var (meðal)eyðsla Prius-bílsins í þessari ferð, mæld í mílum
á galloni?

\(b\) Ef bensín kostar 3,90 $ á gallonið, hver var
eldsneytiskostnaðurinn fyrir þessa ferð?

\(a\) 51 mpg; (b) 62 $

:::

:::note

### Svar:

\(a\) 51 mpg; (b) 62 $

:::

## Umreikningur á hitastigseiningum

Við notum orðið **hitastig**{#term-00004} til að vísa til þess
hversu heitt eða kalt efni er. Ein leið til að mæla breytingu á
hitastigi er að nýta sér þá staðreynd að flest efni þenjast út þegar
hitastig þeirra hækkar og dragast saman þegar hitastig þeirra lækkar.
Vökvinn í venjulegum glerhitamæli breytir um rúmmál eftir því sem
hitastigið breytist og hægt er að nota stöðu yfirborðs hins innilokaða
vökva á prentuðum kvarða sem mælikvarða á hitastig.

Hitakvarðar eru skilgreindir miðað við valin viðmiðunarhitastig: Tvö af
þeim algengustu eru frostmark og suðumark vatns við tiltekinn
loftþrýsting. Á Celsíuskvarðanum er 0 °C skilgreint sem frostmark vatns
og 100 °C sem suðumark vatns. Bilinu milli þessara tveggja hitastiga er
skipt í 100 jöfn bil, sem við köllum gráður. Á
**Fahrenheit**{#term-00005}-kvarðanum er frostmark vatns skilgreint
sem 32 °F og suðumarkið sem 212 °F. Bilinu milli þessara tveggja punkta
á Fahrenheit-hitamæli er skipt í 180 jafna hluta (gráður).

Skilgreining Celsíus- og Fahrenheit-hitakvarðanna eins og lýst er í
fyrri málsgrein leiðir til aðeins flóknara sambands milli hitastigsgilda
á þessum tveimur kvörðum en fyrir mismunandi mælieiningar annarra
eiginleika. Flestar mælieiningar fyrir tiltekinn eiginleika eru í beinu
hlutfalli við hvor aðra (y = mx). Ef við notum kunnuglegar
lengdareiningar sem dæmi:

$${\text{length in feet}={({\frac{{\text{1 ft}}}{{\text{12 in.}}}})}\,\times \,\text{length in inches}}$${#fs-idm6121760}

þar sem y = lengd í fetum, x = lengd í tommum og hlutfallfastinn, m, er
umreikningsstuðullinn. Celsíus- og Fahrenheit-hitakvarðarnir deila hins
vegar ekki sameiginlegum núllpunkti og því er sambandið milli þessara
tveggja kvarða línulegt frekar en í beinu hlutfalli (y = mx + b). Þar af
leiðandi krefst umreikningur á hitastigi af öðrum þessara kvarða yfir á
hinn meira en einfaldrar margföldunar með umreikningsstuðli, m; það
verður einnig að taka tillit til mismunar á núllpunktum kvarðanna (b).

Línulega jöfnan sem tengir Celsíus- og Fahrenheit-hitastig er
auðveldlega leidd út frá þeim tveimur hitastigum sem notuð eru til að
skilgreina hvorn kvarða.. Ef við táknum Celsíus-hitastigið sem *x* og
Fahrenheit-hitastigið sem *y* er hallatalan, *m*, reiknuð út sem:

$${m=\,\frac{{\text{Δ}y}}{{\text{Δ}x}}\,=\frac{{\text{212 °F}-\text{32 °F}\,}}{{\text{100 °C}-\text{0 °C}}}\,=\,\frac{{\text{180 °F}}}{{\text{100 °C}}}\,=\,\frac{{\text{9 °F}}}{{\text{5 °C}}}}$${#fs-idm229969840}

Skurðpunktur jöfnunnar við *y*-ás, *b*, er síðan reiknaður út með því að
nota annaðhvort jafngildu hitastigsparanna, (100 °C, 212 °F) eða (0 °C,
32 °F), sem:

$${b=y-mx=\text{32 °F}-\,\frac{{\text{9 °F}}}{{\text{5 °C}}}\,\times \,\text{0 °C}=\text{32 °F}}$${#fs-idm234430272}

Jafnan sem tengir saman hitastigskvarðana (*T*) er þá:

$${{T}_{{\text{°F}}}={({\frac{{\text{9 °F}}}{{\text{5 °C}}}\,\times \,{T}_{{\text{°C}}}})}+\text{32 °F}}$${#fs-idm305465424}

Stytt útgáfa af þessari jöfnu sem sleppir mælieiningunum er:

$${{T}_{{\text{°F}}}=\,(\frac{9}{{5\,}}\,\times \,{T}_{{\text{°C}}})+32}$${#fs-idm226315088}

Með því að umraða þessari jöfnu fæst form sem er gagnlegt til að breyta
úr Fahrenheit í Celsíus:

$${{T}_{{\text{°C}}}=\,\frac{{5\,}}{{9}}{({{T}_{{\text{°F}}}-32})}}$${#fs-idm138168256}

Eins og fyrr var nefnt í þessum kafla er SI-eining hitastigs kelvin (K).
Ólíkt Celsíus- og Fahrenheit-kvarðanum er kelvin-kvarðinn alger
hitastigskvarði þar sem 0 (núll) K samsvarar lægsta hitastigi sem
fræðilega er hægt að ná. Þar sem kelvin-hitastigskvarðinn er alger er
gráðumerki ekki notað í skammstöfun einingarinnar, K. Uppgötvun á
sambandi milli rúmmáls og hitastigs gass snemma á 19. öld gaf til kynna
að rúmmál gass yrði núll við −273,15 °C. Árið 1848 lagði breski
eðlisfræðingurinn William Thompson, sem síðar tók sér titilinn Kelvin
lávarður, til algeran hitastigskvarða byggðan á þessu hugtaki (nánari
umfjöllun um þetta efni er að finna í kaflanum um gös í þessum texta).

Frostmark vatns á þessum kvarða er 273,15 K og suðumark þess er 373,15
K. Takið eftir að talnamunurinn á þessum tveimur viðmiðunarhitastigum er
100, sá sami og fyrir Celsíus-kvarðann, og því mun línulega sambandið
milli þessara tveggja hitastigskvarða sýna hallatölu upp á
$${1\,\frac{\text{K}}{{\text{°C}}}}$$. Með sömu aðferð eru jöfnurnar til að breyta á milli
kelvin- og Celsíus-hitastigskvarðanna leiddar út sem:

${{T}_{\text{K}}={T}_{{\text{°C}}}+\text{273.15}}${#fs-idp289344}

${{T}_{{\text{°C}}}={T}_{\text{K}}-\text{273.15}}${#fs-idm303916848}

Talan 273,15 í þessum jöfnum hefur verið ákvörðuð með tilraunum, svo hún
er ekki nákvæm. \[↗\](#CNX_Chem_01_06_TempScales) sýnir sambandið
milli þriggja hitastigskvarðanna.

![](CNX_Chem_01_06_TempScales.jpg){#CNX_Chem_01_06_TempScales}

*Mynd 1.18: Fahrenheit-, Celsíus- og kelvin-hitastigskvarðarnir eru
bornir saman.*{#CNX_Chem_01_06_TempScales}

Þrátt fyrir að kelvin- (alger) hitastigskvarðinn sé opinber
SI-hitastigskvarðinn er Celsíus-kvarðinn almennt notaður í mörgu
vísindalegu samhengi og er sá kvarði sem valinn er í óvísindalegu
samhengi í næstum öllum heimshlutum. Mjög fá lönd (Bandaríkin og
yfirráðasvæði þeirra, Bahamaeyjar, Belís, Cayman-eyjar og Palá) nota enn
Fahrenheit fyrir veður, læknisfræði og matreiðslu.

::: example

### Dæmi 1.9: Umreikningur úr Celsíus

Venjulegur líkamshiti hefur almennt verið viðurkenndur sem 37,0 °C (þótt
hann sé breytilegur eftir tíma dags og mælingaraðferð, sem og milli
einstaklinga). Hvað er þetta hitastig á kelvin-kvarða og á
Fahrenheit-kvarða?

**Lausn**

${\text{K}=\text{°C}+273.15=37.0+273.2=\text{310.2 K}}${#fs-idm223031696}

$${\text{°F}=\frac{9}{5}\text{°C}+32.0={({\frac{9}{5}\,\times \,37.0})}+32.0=66.6+32.0=\text{98.6 °F}}$${#fs-idp114907616}

**Skoðaðu þekkingu þína**

Umreiknaðu 80,92 °C í K og °F.

354,07 K, 177,7 °F

:::

:::note

### Svar:

354,07 K, 177,7 °F

:::

::: example

### Dæmi 1.10: Umreikningur úr Fahrenheit

Þegar baka á tilbúna pítsu er krafist ofnhita upp á 450 °F. Ef þú ert í
Evrópu og hitamælirinn í ofninum þínum notar Celsíus-kvarðann, hver er
þá stillingin? Hver er hitinn á Kelvin-kvarða?

**Lausn**

$${\text{°C}=\,\frac{5}{9}\text{(°F}-\text{32)}=\,\frac{5}{9}{({450-32})}=\,\frac{5}{9}\,\times \,418=\text{232 °C}\,\longrightarrow \,\text{set oven to 230 °C}\,{({\text{two significant figures}})}}$${#fs-idm32912}

$${\text{K}=\text{°C}+273.15=\frac{5}{9}\text{(°F}-\text{32)}=\frac{5}{9}(450-32)+273.15=505.4\,\text{K}\,\longrightarrow 5.1\times {10}^{2}\text{K}}$${#fs-idm144212448}

**Skoðaðu þekkingu þína**

Umbreyttu 50 °F í °C og K.

10 °C, 280 K

:::

:::note

### Svar:

10 °C, 280 K

:::

## Lykilhugtök og samantekt

Mælingar eru gerðar með ýmsum einingum. Það er oft gagnlegt eða
nauðsynlegt að umbreyta mældri stærð úr einni einingu í aðra. Þessar
umbreytingar eru gerðar með einingabreytingarþáttum, sem eru fengnir með
einfaldri beitingu stærðfræðilegrar aðferðar sem kallast
þáttamerkingaraðferðin eða einingagreining. Þessi aðferð er einnig notuð
til að reikna út umbeðnar stærðir með því að nota mældar stærðir og
viðeigandi stærðfræðileg tengsl.

## Lykiljöfnur

| ${{T}_{{\text{°C}}}=\,\frac{{5}}{{9}}\,\times \,({T}_{{\text{°F}}}-32})$ | | :--- | | ${{T}_{{\text{°F}}}=\,(\frac{9}{{5}}\,\times \,{T}_{{\text{°C}}})+32}$ | | ${{T}_{\text{K}}=\text{°C}+273.15}$ | |
${{T}_{{\text{°C}}}=\text{K}-273.15}$ | {id="key-equations-table" summary="key equations table"}

## Efnafræði – Æfingar í lok kafla

:::practice-problem{#fs-idm287695728} Skrifaðu umbreytingarþætti (sem
hlutföll) fyrir fjölda:

\(a\) yarda í 1 metra

\(b\) lítra í 1 liquid quart

\(c\) punda í 1 kílógrammi

:::answer (a) ${\frac{{\text{1.0936 yd}}}{{\text{1 m}}}}$; (b) ${\frac{{\text{0.94635 L}}}{{\text{1 qt}}}}$; (c) $${\frac{{\text{2.2046 lb}}}{{\text{1 kg}}}}$$

::: :::

:::practice-problem{#fs-idm321326256} Skrifaðu umbreytingarþætti (sem
hlutföll) fyrir fjölda:

\(a\) kílómetra í 1 mílu

\(b\) lítra í 1 rúmfeti

\(c\) gramma í 1 únsu

:::

:::practice-problem{#fs-idp43396912} Á miðanum á gosflösku er rúmmálið
gefið upp í tveimur einingum: 2,0 L og 67,6 fl oz. Notaðu þessar
upplýsingar til að leiða út umbreytingarþátt milli enskra og
metrakerfiseininga. Hversu marga markverða stafi geturðu réttlætt í
umbreytingarþættinum þínum?

:::answer $\frac{{\text{2.0 L}}}{{\text{67.6 fl oz}}}\,=\,\frac{{\text{0.030 L}}}{{\text{1 fl oz}}}$ Aðeins tveir markverðir stafir eru
réttlætanlegir.

::: :::

:::practice-problem{#fs-idm124621456} Á miðanum á morgunkornspakka er
massi kornsins gefinn upp í tveimur einingum: 978 grömm og 34,5 oz.
Notaðu þessar upplýsingar til að finna umbreytingarþátt milli enskra og
metrakerfiseininga. Hversu marga markverða stafi geturðu réttlætt í
umbreytingarþættinum þínum?

:::

:::practice-problem{#fs-idm125803088} Fótbolti er spilaður með hringlaga
bolta sem hefur ummál á milli 27 og 28 tommur og þyngd á milli 14 og 16
únsur. Hverjar eru þessar forskriftir í einingum sentímetra og gramma?

:::answer 68–71 cm; 400–450 g

::: :::


:::practice-problem{#fs-idm128259568} Ummál körfubolta fyrir konur er á
milli 28,5 og 29,0 tommur og hámarksþyngd hans er 20 únsur (tveir
markverðir stafir). Hverjar eru þessar forskriftir í sentímetrum og
grömmum?

:::

:::practice-problem{#fs-idm203954352} Hversu margir millilítrar af
gosdrykk eru í 12,0 únsu dós?

:::answer 355 ml

::: :::

:::practice-problem{#fs-idm290820272} Ein olíutunna er nákvæmlega 42
gallon. Hversu margir lítrar af olíu eru í einni tunnu?

:::

:::practice-problem{#fs-idp32978240} Þvermál rauðrar blóðfrumu er um 3
$\times$ 10^−4^ tommur. Hvert er þvermál hennar í sentímetrum?

:::answer 8 $\times$ 10^−4^ cm

::: :::

:::practice-problem{#fs-idp3893440} Fjarlægðin milli miðju tveggja
súrefnisatóma í súrefnissameind er 1,21 $\times$ 10^−8^ cm. Hver er
þessi fjarlægð í tommum?

:::

:::practice-problem{#fs-idm280166528} Er 197 punda lyftingamaður nógu
léttur til að keppa í flokki sem er takmarkaður við þá sem vega 90 kg
eða minna?

:::answer já; þyngd = 89,4 kg

::: :::

:::practice-problem{#fs-idm311405440} Mjög góður 197 punda lyftingamaður
lyfti 192 kg í hreyfingu sem kallast jafnhending. Hver var massi
þyngdarinnar sem lyft var í pundum?

:::

:::practice-problem{#fs-idm159954784} Mörg læknisfræðileg
rannsóknarstofupróf eru framkvæmd með 5,0 μL af blóðsermi. Hvert er
þetta rúmmál í millilítrum?

:::answer 5,0 $\times$ 10^−3^ ml

::: :::

:::practice-problem{#fs-idm293326720} Ef aspiríntöflu inniheldur 325 mg
af aspiríni, hversu mörg grömm af aspiríni inniheldur hún?

:::

:::practice-problem{#fs-idm101514016} Notaðu staðalform
(veldisvísanotkun) til að tákna eftirfarandi stærðir með
SI-grunneiningum í \[↗\](#fs-idm81346144):

\(a\) 0,13 g

\(b\) 232 Gg

\(c\) 5,23 pm

\(d\) 86,3 mg

\(e\) 37,6 cm

\(f\) 54 μm

\(g\) 1 Ts

\(h\) 27 ps

\(i\) 0,15 mK

:::answer (a) 1,3 $\times$ 10^−4^ kg; (b) 2,32 $\times$ 10^8^
kg; (c) 5,23 $\times$ 10^−12^ m; (d) 8,63 $\times$ 10^−5^ kg;
(e) 3,76 $\times$ 10^−1^ m; (f) 5,4 $\times$ 10^−5^ m; (g) 1
$\times$ 10^12^ s; (h) 2,7 $\times$ 10^−11^ s; (i) 1,5
$\times$ 10^−4^ K

::: :::

:::practice-problem{#fs-idm247037968} Ljúktu við eftirfarandi
umreikninga milli SI-eininga.

\(a\) 612 g = \_\_\_\_\_\_\_\_ mg

\(b\) 8,160 m = \_\_\_\_\_\_\_\_ cm

\(c\) 3779 μg = \_\_\_\_\_\_\_\_ g

\(d\) 781 ml = \_\_\_\_\_\_\_\_ L

\(e\) 4,18 kg = \_\_\_\_\_\_\_\_ g

\(f\) 27,8 m = \_\_\_\_\_\_\_\_ km

\(g\) 0,13 ml = \_\_\_\_\_\_\_\_ L

\(h\) 1738 km = \_\_\_\_\_\_\_\_ m

\(i\) 1,9 Gg = \_\_\_\_\_\_\_\_ g

:::

:::practice-problem{#fs-idp54026624} Bensín er selt í lítrum í mörgum
löndum. Hversu marga lítra þarf til að fylla 12.0-gal bensíntank?

:::svar 45,4 L

::: :::

:::æfingadæmi{#fs-idm242942368} Mjólk er seld í lítrum í mörgum löndum.
Hvert er rúmmál nákvæmlega 1/2 g af mjólk í lítrum?

:::

:::æfingadæmi{#fs-idm186995360} Langt tonn er skilgreint sem nákvæmlega
2240 lb. Hver er þessi massi í kílógrömmum?

:::svar 1,0160 $\times$ 10^3^ kg

::: :::

:::æfingadæmi{#fs-idm311016240} Framkvæmdu umreikninginn sem tilgreindur
er í hverjum af eftirfarandi liðum:

\(a\) heimsmet karla í langstökki, 29 ft 4¼ in., í metra

\(b\) mesta dýpi hafsins, um 6,5 mílur, í kílómetra

\(c\) flatarmál Oregon-fylkis, 96.981 mílur^2^, í ferkílómetra

\(d\) rúmmál 1 gills (nákvæmlega 4 oz) í millilítra

\(e\) áætlað rúmmál heimshafanna, 330.000.000 mílur^3^, í rúmkílómetra.

\(f\) massa 3525 lb bíls í kílógrömm

\(g\) massa 2,3 oz eggs í grömm

:::

:::æfingadæmi{#fs-idm250694352} Framkvæmdu umreikninginn sem tilgreindur
er í hverjum af eftirfarandi liðum:

\(a\) lengd fótboltavallar, 120 m (þrír markverðir stafir), í fet

\(b\) hæð Kilimanjaro-fjalls, 19.565 fet, hæsta fjalls Afríku, í
kílómetra

\(c\) flatarmál 8,5 × 11 tommu blaðs í cm^2^

\(d\) slagrými bílvélar, 161 in.^3^, í lítra

\(e\) áætlaðan massa lofthjúpsins, 5,6 × 10^15^ tonn, í kílógrömm

\(f\) massa rússínukers, 32,0 lb, í kílógrömm

\(g\) massa 5,00 greina aspiríntöflu í milligrömm (1 grein = 0,00229 oz)

:::svar (a) 394 ft; (b) 5,9634 km; (c) 6,0 $\times$ 10^2^; (d) 2,64
L; (e) 5,1 $\times$ 10^18^ kg; (f) 14,5 kg; (g) 324 mg

::: :::

:::æfingadæmi{#fs-idm219388000} Á mörgum efnafræðiráðstefnum hefur verið
haldið 50 trilljón angstroma hlaup (tveir markverðir stafir). Hversu
langt er þetta hlaup í kílómetrum og mílum? (1 Å = 1 $\times$
10^−10^ m)

:::

:::æfingadæmi{#fs-idm311640624} 50 trilljón angstroma hlaup efnafræðings
(sjá \[↗\](#fs-idm219388000)) væri 10.900 álna hlaup
fornleifafræðings. Hversu löng er ein alin í metrum og fetum? (1 Å = 1
$\times$ 10^−8^ cm)

:::svar 0,46 m; 1,5 ft/áln

::: :::

:::æfingadæmi{#fs-idm306975136} Bensíntankur ákveðins lúxusbíls tekur
22,3 gallon samkvæmt handbók eiganda. Ef eðlismassi bensíns er 0,8206
g/mL, ákvarðaðu massa eldsneytisins í fullum tanki í kílógrömmum og
pundum.

:::

:::æfingadæmi{#fs-idm244153744} Kennari er að undirbúa tilraun og þarf
225 g af fosfórsýru. Eina ílátið sem er aðgengilegt er 150 ml
keiluflaska. Er hún nógu stór til að rúma sýruna, en eðlismassi hennar
er 1,83 g/mL?

:::svar Já, rúmmál sýrunnar er 123 ml.

::: :::

:::æfingadæmi{#fs-idm110873792} Til að undirbúa sig fyrir
rannsóknarstofutíma þarf aðstoðarmaður nemanda 125 g af efnasambandi.
Flaska sem inniheldur 1/4 lb er fáanleg. Hafði nemandinn nóg af
efnasambandinu?

:::

:::æfingadæmi{#fs-idp15401744} Efnafræðinemi er 159 cm á hæð og vegur
45,8 kg. Hver er hæð hennar í tommum og þyngd í pundum?

:::svar 62,6 tommur (um 5 fet 3 tommur) og 101 lb

::: :::

:::æfingadæmi{#fs-idm207241008} Í nýlegum Grand Prix-kappakstri lauk
sigurvegarinn keppni með meðalhraðann 229.8 km/klst. Hver var hraði hans
í mílum á klukkustund, metrum á sekúndu og fetum á sekúndu?

:::

:::practice-problem{#fs-idm289866560} Leysið þessi dæmi um timburmál.

\(a\) Til að lýsa fyrir Evrópubúa hvernig hús eru byggð í Bandaríkjunum
þarf að breyta málinu á „tveir sinnum fjórir“ timbri í metrakerfi.
Þykktin $\times$ breiddin $\times$ lengdin eru 1,50 tommur
$\times$ 3,50 tommur $\times$ 8,00 fet í Bandaríkjunum. Hver
eru málin í cm $\times$ cm $\times$ m?

\(b\) Þetta timbur er hægt að nota sem lóðrétta stoð, sem venjulega er
komið fyrir með 16,0 tommu millibili. Hver er sú fjarlægð í sentímetrum?

:::answer (a) 3,81 cm $\times$ 8,89 cm $\times$ 2,44 m; (b)
40,6 cm

::: :::

:::practice-problem{#fs-idm95632784} Talið var að kvikasilfursinnihald í
læk væri yfir því lágmarki sem talið er öruggt – 1 hluti á milljarð
(ppb) miðað við þyngd. Greining leiddi í ljós að styrkurinn var 0,68
hlutar á milljarð. Hvaða magn af kvikasilfri í grömmum var til staðar í
15,0 L af vatninu, en eðlismassi þess er 0,998 g/ml? $${\text{(1 ppb Hg}=\,\frac{{\text{1 ng Hg}}}{{\text{1 g water}}}\text{)}}$$

:::

:::practice-problem{#fs-idm215857872} Reiknið út eðlismassa áls ef 27,6
cm^3^ hefur massann 74,6 g.

:::answer 2,70 g/cm^3^

::: :::

:::practice-problem{#fs-idm215482272} Osmín er eitt af eðlisþyngstu
frumefnum sem þekkt eru. Hver er eðlismassi þess ef 2,72 g hefur
rúmmálið 0,121 cm^3^?

:::

:::practice-problem{#fs-idm361862336} Reiknið út þessa massa.

\(a\) Hver er massi 6,00 cm^3^ af kvikasilfri, eðlismassi = 13,5939
g/cm^3^?

\(b\) Hver er massi 25,0 ml af oktani, eðlismassi = 0,702 g/cm^3^?

:::answer (a) 81,6 g; (b) 17,6 g

::: :::

:::practice-problem{#fs-idm305607360} Reiknið út þessa massa.

\(a\) Hver er massi 4,00 cm^3^ af natríum, eðlismassi = 0,97 g/cm^3^?

\(b\) Hver er massi 125 ml af klórgasi, eðlismassi = 3,16 g/L?

:::

:::practice-problem{#fs-idm216432832} Reiknið út þessi rúmmál.

\(a\) Hvert er rúmmál 25 g af joði, eðlismassi = 4,93 g/cm^3^?

\(b\) Hvert er rúmmál 3,28 g af vetnisgasi, eðlismassi = 0,089 g/L?

:::answer (a) 5,1 ml; (b) 37 L

::: :::

:::practice-problem{#fs-idm182387776} Reiknið út þessi rúmmál.

\(a\) Hvert er rúmmál 11,3 g af grafíti, eðlismassi = 2,25 g/cm^3^?

\(b\) Hvert er rúmmál 39,657 g af brómi, eðlismassi = 2,928 g/cm^3^?

:::

:::practice-problem{#fs-idm208263472} Breytið suðuhitastigi gulls, 2966
°C, í Fahrenheit-gráður og kelvin.

:::answer 5371 °F, 3239 K

::: :::

:::practice-problem{#fs-idm291580080} Breytið hitastigi sjóðandi heits
vatns, 54 °C, í Fahrenheit-gráður og kelvin.

:::

:::practice-problem{#fs-idm126910176} Breytið hitastigi kaldasta
svæðisins í frysti, −10 °F, í Selsíusgráður og kelvin.

:::answer −23 °C, 250 K

::: :::

:::practice-problem{#fs-idm294247168} Breytið hitastigi þurríss, −77 °C,
í Fahrenheit-gráður og kelvin.

:::

:::practice-problem{#fs-idm312310640} Breytið suðuhitastigi fljótandi
ammóníaks, −28,1 °F, í Selsíusgráður og kelvin.

:::answer −33,4 °C, 239.8 K

::: :::

:::practice-problem{#fs-idm307064960} Á merkimiða á úðabrúsa með
sótthreinsiefni er varað við því að hita brúsann yfir 130 °F. Hvert er
samsvarandi hitastig á Celsíus- og kelvinkvarða?

:::

:::practice-problem{#fs-idm161487744} Veðrið í Evrópu var óvenjulega
hlýtt sumarið 1995. Í sjónvarpsfréttum var sagt frá hitastigi allt að 45
°C. Hvert var hitastigið á Fahrenheit-kvarða?

:::answer 113 °F

::: :::
