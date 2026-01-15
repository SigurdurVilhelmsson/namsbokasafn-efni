---
title: "Stærðfræðileg meðhöndlun mæligagna"
section: "1.6"
chapter: 1
---

## 1.6 Stærðfræðileg meðferð á niðurstöðum mælinga

:::learning-objectives

Í lok þessa kafla muntu geta:

-   Útskýrt einingagreiningu sem nálgun við stærðfræðilega útreikninga
    sem fela í sér stærðir
-   Notað einingagreiningu til að breyta einingum fyrir tiltekinn
    eiginleika og í útreikninga sem fela í sér tvo eða fleiri eiginleika

:::

Oft er það svo að stærð sem vekur áhuga er ekki auðvelt (eða jafnvel
mögulegt) að mæla beint, heldur verður að reikna hana út frá öðrum beint
mældum eiginleikum og viðeigandi stærðfræðilegum tengslum. Tökum sem
dæmi mælingu á meðalhraða íþróttamanns sem hleypur spretti. Þetta er
venjulega gert með því að mæla *tímann* sem það tekur íþróttamanninn að
hlaupa frá ráslínu að marklínu og *vegalengdina* milli þessara tveggja
lína og reikna síðan *hraðann* út frá jöfnunni sem tengir þessa þrjá
eiginleika:

$\text{speed} = \ \frac{\text{distance}}{\text{time}}$

Spretthlaupari á heimsmælikvarða getur hlaupið 100 m á um það bil 10 s,
sem samsvarar meðalhraða upp á

$\frac{\text{100 m}}{\text{10 s}}\  = \text{10 m/s}$

(Fyrir þennan og næsta útreikning skal gera ráð fyrir að núllin aftast
séu markverðir stafir.) Athugaðu að þessi einfalda reikningsaðgerð felur
í sér að deila tölum hverrar mældrar stærðar til að fá tölu reiknuðu
stærðarinnar (100/10 = 10) *og sömuleiðis* að deila einingum hverrar
mældrar stærðar til að fá einingu reiknuðu stærðarinnar (m/s = m/s).
Íhugaðu nú að nota þetta sama samband til að spá fyrir um þann tíma sem
það tekur mann sem hleypur á þessum hraða að fara 25 m vegalengd. Sama
samband milli þessa þriggja eiginleika er notað, en í þessu tilfelli eru
stærðirnar tvær sem gefnar eru hraði (10 m/s) og vegalengd (25 m). Til
að fá þann eiginleika sem leitað er að, þ.e. tíma, verður að umraða
jöfnunni á viðeigandi hátt:

$\text{time} = \ \frac{\text{distance}}{\text{speed}}$

Þá er hægt að reikna tímann sem:

$\frac{\text{25 m}}{\text{10 m/s}}\  = \text{2.5 s}$

Aftur fylgdi sama reikningsaðgerðin á einingunum (m/(m/s) = s)
reikningsaðgerðinni á tölunum (25/10 = 2,5) til að fá bæði tölu og
einingu niðurstöðunnar, sem er 2,5 s. Athugaðu að, rétt eins og með
tölur, þegar einingu er deilt með sams konar einingu (í þessu tilfelli,
m/m), er niðurstaðan „1" -- eða, eins og almennt er orðað, einingarnar
„styttast út".

\|\|\|UNTRANSLATED_CONTENT_START\|\|\|These calculations are examples of
a versatile mathematical approach known as dimensional analysis (or the
factor-label method).
\|\|\|UNTRANSLATED_CONTENT_END\|\|\|Einingagreining byggir á þeirri
forsendu að *einingar stærða verði að lúta sömu stærðfræðilegu aðgerðum
og tilheyrandi tölur þeirra*. Þessari aðferð má beita við útreikninga,
allt frá einföldum einingabreytingum til flóknari, margra þrepa
útreikninga sem fela í sér nokkrar mismunandi stærðir.

### Umreikningsstuðlar og einingagreining

Hlutfall tveggja jafngildra stærða sem gefnar eru upp með mismunandi
mælieiningum má nota sem umreikningsstuðul fyrir einingar. Til dæmis eru
lengdirnar 2,54 cm og 1 tomma jafngildar (samkvæmt skilgreiningu) og því
má leiða út umreikningsstuðul fyrir einingar úr hlutfallinu,

$\frac{\text{2.54 cm}}{\text{1 in.}}\ \text{(2.54 cm} = \text{1 in.) or 2.54}\ \frac{\text{cm}}{\text{in.}}$

Nokkrir aðrir algengir umreikningsstuðlar eru gefnir í [töflu
1.6](#fs-idm222237232).

Algengir umreikningsstuðlar

| Lengd | Rúmmál | Massi |
|---|---|---|
| 1 m = 1,0936 yd | 1 L = 1,0567 qt | 1 kg = 2,2046 lb |
| 1 \". = 2,54 cm (nákvæmlega) | 1 qt = 0,94635 L | 1 lb = 453,59g[2](#foot-00001) |
|  |  | 2 |
|  |  | Strangt til tekið eru únsa og pund einingar fyrir þyngd, *W* (kraftur sem jafngildir margfeldi massa og þyngdarhröðunar, *W* = *mg*). Umreikningstengslin í þessari töflu eru almennt notuð til að jafna massa og þyngd miðað við nafngildi fyrir *g* við yfirborð jarðar. |
| 1 km = 0.62137 mi | 1 ft^3^ = 28,317 L | 1 (avoirdupois) oz = 28,349 g |
| 1 mi = 1609,3 m | 1 msk = 14,787 ml | 1 (troy) oz = 31,103 g |

Tafla 1.6

Þegar stærð (svo sem vegalengd í tommum) er margfölduð með viðeigandi
umreikningsstuðli fyrir einingar er stærðinni breytt í jafngilt gildi
með öðrum einingum (svo sem vegalengd í sentímetrum). Til dæmis er hægt
að breyta 34 tommu lóðréttu stökki körfuboltamanns í sentímetra með:

$34\ \text{in.}\  \times \ \frac{\text{2.54 cm}}{1\ \text{in.}}\  = \text{86 cm}$

Þar sem þessi einfalda reikningsaðgerð felur í sér *stærðir* krefst
forsenda einingagreiningar þess að við margföldum bæði *tölur og
einingar*. Tölur þessara tveggja stærða eru margfaldaðar til að gefa
tölu niðurstöðunnar, 86, en einingarnar eru margfaldaðar til að gefa af
sér $\frac{\text{in.}\  \times \ \text{cm}}{\text{in.}}$. Rétt eins og
fyrir tölur er hlutfall sömu eininga einnig tölulega jafnt og einn
$\frac{\text{in.}}{\text{in.}}\  = \text{1,}$ og einingin einfaldast
þannig í *cm*. (Þegar eins einingar deilast og gefa stuðulinn 1 er sagt
að þær „styttist út".) Einingagreiningu má nota til að staðfesta rétta
notkun á umreikningsstuðlum eininga eins og sýnt er í eftirfarandi dæmi.

:::example
### Dæmi 1.8

#### Notkun á umreikningsstuðli eininga

Massi keppnisfrisbídísks er 125 g. Umreiknaðu massa hans í únsur með því
að nota umreikningsstuðul eininga sem leiddur er af sambandinu 1 oz =
28,349 g ([tafla 1.6](#fs-idm222237232)).

**Lausn**

Með umreikningsstuðulinn gefinn er hægt að finna massann í únsum með
jöfnu svipaðri þeirri sem notuð var til að umreikna lengd úr tommum í
sentímetra.

$x\ \text{oz} = \text{125 g}\  \times \ \text{unit conversion factor}$

Umreikningsstuðul eininga má tákna sem:

$\frac{\text{1 oz}}{\text{28.349 g}}\ \text{and}\ \frac{\text{28.349 g}}{\text{1 oz}}$

Rétti umreikningsstuðullinn er hlutfallið sem styttir út eininguna grömm
og skilur eftir únsur.

![None](./images/media/rId33.png)

:::

:::practice-problem
#### Kannaðu þekkingu þína

Umreiknaðu rúmmál upp á 9,345 qt í lítra.

:::answer
8,844 L

Fyrir utan einfaldar einingaumbreytingar er hægt að nota þessa aðferð
til að leysa flóknari verkefni sem fela í sér útreikninga. Burtséð frá
smáatriðum er grundvallaraðferðin sú sama -- allir *stuðlar* sem koma
við sögu í útreikningnum verða að vera rétt stilltir upp til að tryggja
að *einingar* þeirra styttist út og/eða sameinist á viðeigandi hátt til
að gefa þá einingu sem óskað er eftir í niðurstöðunni. Eftir því sem þú
heldur áfram í efnafræðináminu muntu fá mörg tækifæri til að beita
þessari aðferð.

:::

:::

:::example
### Dæmi 1.9

#### Útreikningur stærða út frá niðurstöðum mælinga og þekktum stærðfræðilegum samböndum

Hver er eðlismassi algengs frostlagar í einingunni g/ml? 4,00 qt sýni af
frostlöginum vegur 9,26 lb.

**Lausn**

Þar sem $\text{density}\ = \ \frac{\text{mass}}{\text{volume}}$ þurfum
við að deila massanum í grömmum með rúmmálinu í millilítrum. Almennt
gildir: fjöldi eininga B = fjöldi eininga A $\times$ umreikningsstuðull
eininga. Nauðsynlegir umreikningsstuðlar eru gefnir í [töflu
1.6](#fs-idm222237232): 1 lb = 453,59 g; 1 L = 1,0567 qt; 1 L = 1.000
ml. Hægt er að umreikna massa úr pundum í grömm á eftirfarandi hátt:

$\text{9.26}\ \text{lb}\  \times \ \frac{\text{453.59 g}}{1\ \text{lb}}\  = 4.20\  \times \ 10^{3}\ \text{g}$

Hægt er að umreikna rúmmál úr kvörtum í millilítra í tveimur skrefum:

1.  Skref 1.

-   Umreikna kvört í lítra.
    $\text{4.00}\ \text{qt}\  \times \ \frac{\text{1 L}}{\text{1.0567}\ \text{qt}}\  = \text{3.78 L}$

2.  Skref 2.

-   Umreikna lítra í millilítra.
    $\text{3.78}\ \text{L}\  \times \ \frac{\text{1000 mL}}{1\ \text{L}}\  = 3.78\  \times \ 10^{3}\ \text{mL}$

Þá,

$\text{density} = \ \frac{\text{4.20}\  \times \ 10^{3}\ \text{g}}{3.78\  \times \ 10^{3}\ \text{mL}}\  = \text{1.11 g/mL}$

Einnig væri hægt að setja útreikninginn upp á þann hátt að nota þrjá
umreikningsstuðla í röð á eftirfarandi hátt:

$\frac{\text{9.26}\ \text{lb}}{\text{4.00}\ \text{qt}}\  \times \ \frac{\text{453.59 g}}{1\ \text{lb}}\  \times \ \frac{\text{1.0567}\ \text{qt}}{1\ \text{L}}\  \times \ \frac{1\ \text{L}}{\text{1000 mL}}\  = \text{1.11 g/mL}$

:::

:::practice-problem
#### Kannaðu þekkingu þína

Hvert er rúmmálið í lítrum af 1,000 oz, að því gefnu að 1 L = 1.0567 qt
og 1 qt = 32 oz (nákvæmlega)?

:::answer
2,957 × 10^−2^ L

:::

 

:::

:::example
### Dæmi 1.10

#### Útreikningur stærða út frá niðurstöðum mælinga og þekktum stærðfræðilegum samböndum

Í akstri frá Philadelphia til Atlanta, um 1250 km vegalengd, eyðir 2014
árgerð af Lamborghini Aventador Roadster 213 L af bensíni.

\(a\) Hver var (meðal)eyðsla Roadster-bílsins í þessari ferð, mæld í
mílum á gallon?

\(b\) Ef bensín kostar 3,80 \$ á gallonið, hver var
eldsneytiskostnaðurinn fyrir þessa ferð?

**Lausn**

\(a\) Fyrst er vegalengdinni breytt úr kílómetrum í mílur:

$1250\ \text{km}\  \times \ \frac{\text{0.62137 mi}}{1\ \text{km}}\  = \text{777 mi}$

og síðan er rúmmálinu breytt úr lítrum í gallon:

$213\ \text{L}\  \times \ \frac{\text{1.0567}\ \text{qt}}{1\ \text{L}}\  \times \ \frac{\text{1 gal}}{4\ \text{qt}}\  = \text{56.3 gal}$

Að lokum,

$\text{(average) mileage} = \ \frac{\text{777 mi}}{\text{56.3 gal}}\  = \text{13.8 miles/gallon} = \text{13.8 mpg}$

Einnig væri hægt að setja útreikninginn upp þannig að allir
umreikningsstuðlar séu notaðir í röð, eins og hér segir:

$\frac{1250\ \text{km}}{213\ \text{L}}\  \times \ \frac{\text{0.62137 mi}}{1\ \text{km}}\  \times \ \frac{1\ \text{L}}{\text{1.0567}\ \text{qt}}\  \times \ \frac{4\ \text{qt}}{\text{1 gal}} = \text{13.8 mpg}$

\(b\) Með því að nota áður útreiknað rúmmál í gallonum fáum við:

$56.3\ \text{gal}\  \times \ \frac{\text{\$3.80}}{1\ \text{gal}} = \text{\$214}$

:::

:::practice-problem
#### Kannaðu þekkingu þína

Toyota Prius Hybrid eyðir 59,7 L af bensíni við að aka frá San Francisco
til Seattle, 1300 km vegalengd (tveir markverðir stafir).

\(a\) Hver var (meðal)eyðsla Prius-bílsins í þessari ferð, mæld í mílum
á gallon?

\(b\) Ef bensín kostar 3,90 \$ á gallonið, hver var
eldsneytiskostnaðurinn fyrir þessa ferð?

:::answer
\(a\) 51 mpg; (b) 62 \$

:::

### Umreikningur á hitastigseiningum

Við notum orðið hitastig til að vísa til þess hversu heitt eða kalt efni
er. Ein leið til að mæla breytingu á hitastigi er að nýta þá staðreynd
að flest efni þenjast út þegar hitastig þeirra hækkar og dragast saman
þegar hitastig þeirra lækkar. Vökvinn í venjulegum glerhitamæli breytir
um rúmmál eftir því sem hitastigið breytist og hægt er að nota stöðu
yfirborðs hins innilokaða vökva á prentuðum kvarða sem mælikvarða á
hitastig.

Hitakvarðar eru skilgreindir miðað við valin viðmiðunarhitastig: Tvö af
þeim algengustu eru frostmark og suðumark vatns við tiltekinn
loftþrýsting. Á Celsíuskvarðanum er 0 °C skilgreint sem frostmark vatns
og 100 °C sem suðumark vatns. Bilinu milli þessara tveggja hitastiga er
skipt í 100 jöfn bil, sem við köllum gráður. Á Fahrenheit-kvarðanum er
frostmark vatns skilgreint sem 32 °F og suðumarkið sem 212 °F. Bilinu
milli þessara tveggja punkta á Fahrenheit-hitamæli er skipt í 180 jafna
hluta (gráður).

Skilgreining Celsíus- og Fahrenheit-hitakvarðanna eins og lýst er í
fyrri málsgrein leiðir til aðeins flóknara sambands milli hitastigsgilda
á þessum tveimur kvörðum en fyrir mismunandi mælieiningar annarra
eiginleika. Flestar mælieiningar fyrir tiltekinn eiginleika eru í beinu
hlutfalli hver við aðra (y = mx). Ef við notum kunnuglegar
lengdareiningar sem dæmi:

$\text{length in feet} = \left( \frac{\text{1 ft}}{\text{12 in.}} \right)\  \times \ \text{length in inches}$

þar sem y = lengd í fetum, x = lengd í tommum og hlutfallfastinn, m, er
umreikningsstuðullinn. Celsíus- og Fahrenheit-hitakvarðarnir deila hins
vegar ekki sameiginlegum núllpunkti og því er sambandið milli þessara
tveggja kvarða línulegt frekar en í beinu hlutfalli (y = mx + b). Þar af
leiðandi krefst umreikningur á hitastigi af öðrum þessara kvarða yfir á
hinn meira en einfaldrar margföldunar með umreikningsstuðli, m; það
verður einnig að taka tillit til mismunar á núllpunktum kvarðanna (b).

Línulega jafnan sem tengir Celsíus- og Fahrenheit-hitastig er
auðveldlega leidd út frá þeim tveimur hitastigum sem notuð eru til að
skilgreina hvorn kvarða. Ef við táknum hitastig á Celsíus sem *x* og
hitastig á Fahrenheit sem *y*, er hallatalan, *m*, reiknuð út sem:

$m = \ \frac{\text{Δ}y}{\text{Δ}x}\  = \frac{\text{212 °F} - \text{32 °F}\ }{\text{100 °C} - \text{0 °C}}\  = \ \frac{\text{180 °F}}{\text{100 °C}}\  = \ \frac{\text{9 °F}}{\text{5 °C}}$

Skurðpunktur jöfnunnar við *y-ás*, *b*, er síðan reiknaður út með því að
nota annaðhvort jafngild hitastigspör, (100 °C, 212 °F) eða (0 °C, 32
°F), á þennan hátt:

$b = y - mx = \text{32 °F} - \ \frac{\text{9 °F}}{\text{5 °C}}\  \times \ \text{0 °C} = \text{32 °F}$

Jafnan sem tengir saman hitastigskvarðana (*T*) er þá:

$T_{\text{°F}} = \left( \frac{\text{9 °F}}{\text{5 °C}}\  \times \ T_{\text{°C}} \right) + \text{32 °F}$

Stytt útgáfa af þessari jöfnu sem sleppir mælieiningunum er:

$T_{\text{°F}} = \ \left( \frac{9}{5\ }\  \times \ T_{\text{°C}} \right) + 32$

Umröðun þessarar jöfnu gefur formið sem er gagnlegt til að breyta úr
Fahrenheit í Celsíus:

$T_{\text{°C}} = \ \frac{5\ }{9}\left( T_{\text{°F}} - 32 \right)$

Eins og fyrr var nefnt í þessum kafla er SI-eining hitastigs kelvin (K).
Ólíkt Celsíus- og Fahrenheit-kvarðanum er kelvin-kvarðinn algildur
hitastigskvarði þar sem 0 (núll) K samsvarar lægsta hitastigi sem
fræðilega er hægt að ná. Þar sem kelvinhitakvarðinn er algildur er
gráðutákn ekki innifalið í skammstöfun einingarinnar, K. Uppgötvun
snemma á 19. öld á sambandinu milli rúmmáls og hitastigs lofttegundar
gaf til kynna að rúmmál lofttegundar væri núll við -273,15 °C. Árið 1848
lagði breski eðlisfræðingurinn William Thompson, sem síðar tók upp
titilinn Lord Kelvin, til algildan hitakvarða byggðan á þessu hugtaki
(frekari umfjöllun um þetta efni er að finna í kaflanum um
lofttegundir).

Storknunarhitastig vatns á þessum kvarða er 273,15 K og suðuhitastig
þess er 373,15 K. Takið eftir að tölulegur munur á þessum tveimur
viðmiðunarhitastigum er 100, sá sami og fyrir Celsíus-kvarðann, og því
mun línulega sambandið milli þessara tveggja hitastigskvarða sýna
hallatölu sem er $1\ \frac{\text{K}}{\text{°C}}$. Með sömu aðferð eru
jöfnurnar til að breyta á milli kelvin- og Celsíus-hitastigskvarðanna
leiddar út sem:

$T_{\text{K}} = T_{\text{°C}} + \text{273.15}$

$T_{\text{°C}} = T_{\text{K}} - \text{273.15}$

Talan 273,15 í þessum jöfnum hefur verið ákvörðuð með tilraunum og er
því ekki nákvæm. [Mynd 1.28](#CNX_Chem_01_06_TempScales) sýnir sambandið
milli þessara þriggja hitastigskvarða.


![A thermometer is shown for the Fahrenheit, Celsius and Kelvin scales. Under the Fahrenheit scale, the boiling point of water is 212 degrees while the freezing point of water is 32 degrees. Therefore, there are 180 Fahrenheit degrees between the boiling point of water and the freezing point of water. Under the Celsius scale, the boiling point of water is 100 degrees while the freezing point of water is 0 degrees. Therefore, there are 100 Celsius degrees between the boiling point and freezing point of water. Under the kelvin scale, the boiling point of water is 373.15 K, while the freezing point of water is 273.15 K. 233.15 K is equal to negative 40 degrees Celsius, which is also equal to negative 40 degrees Fahrenheit.](./images/media/rId65.jpg)


Mynd 1.28 Fahrenheit-, Celsíus- og kelvin-hitastigskvarðarnir eru bornir
saman.

Þrátt fyrir að kelvin- (algildi) hitastigskvarðinn sé opinberi
SI-hitastigskvarðinn er Celsíus-kvarðinn almennt notaður í tengslum við
vísindi og er sá kvarði sem valinn er í óvísindalegu samhengi í næstum
öllum heimshlutum. Örfá lönd (Bandaríkin og yfirráðasvæði þeirra,
Bahamaeyjar, Belís, Cayman-eyjar og Palá) nota enn Fahrenheit fyrir
veður, læknisfræði og matreiðslu.

:::

:::example
### Dæmi 1.11

#### Umreikningur úr Celsíus

Venjulegur líkamshiti hefur almennt verið talinn 37,0 °C (þótt hann sé
breytilegur eftir tíma dags og mælingaraðferð, sem og milli
einstaklinga). Hvað er þetta hitastig á kelvin-kvarða og á
Fahrenheit-kvarða?

**Lausn**

$\text{K} = \text{°C} + 273.15 = 37.0 + 273.2 = \text{310.2 K}$

$\text{°F} = \frac{9}{5}\text{°C} + 32.0 = \left( \frac{9}{5}\  \times \ 37.0 \right) + 32.0 = 66.6 + 32.0 = \text{98.6 °F}$

:::

:::practice-problem
#### Kannaðu þekkingu þína

Umreiknaðu 80,92 °C í K og °F.

:::answer
354,07 K, 177,7 °F

:::

 

:::

:::example
### Dæmi 1.12

#### Umreikningur úr Fahrenheit

Þegar baka á tilbúna pítsu er krafist ofnhita upp á 450 °F. Ef þú ert í
Evrópu og hitamælirinn í ofninum þínum notar Celsíus-kvarðann, hver er
þá stillingin? Hvert er hitastigið í kelvin?

**Lausn**

$\text{°C} = \ \frac{5}{9}\text{(°F} - \text{32)} = \ \frac{5}{9}(450 - 32) = \ \frac{5}{9}\  \times \ 418 = \text{232 °C}\  \rightarrow \ \text{set oven to 230 °C}\quad\quad\left( \text{two significant figures} \right)$

$\text{K} = \text{°C} + 273.15 = \frac{5}{9}\text{(°F} - \text{32)} = \frac{5}{9}(450 - 32) + 273.15 = 505.4\ \text{K}\  \rightarrow 5.1 \times 10^{2}\text{K}$

:::

:::practice-problem
#### Kannaðu þekkingu þína

Umbreyttu 50 °F í °C og K.

:::answer
10 °C, 280 K

:::

:::
