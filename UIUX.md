# Bee There – UI/UX alapok

2026. szeptember 29. Első megvalósítási kör.

## Kutatás és alkalmazás

- Apple: olvasható szöveg, világos hierarchia, pontosan megérinthető vezérlők. Az Apple 44 × 44 pontos célterületet javasol. A webes appban a fő vezérlők 48 CSS px-es méretet kapnak; a platformok mértékegységei nem azonosak. https://developer.apple.com/design/tips/
- Samsung One UI: fókusz az aktuális feladaton, elérhető alsó interakciós terület, kényelmes olvasás és adaptív elrendezés. Megmarad az alsó navigáció, a lapok egyértelmű aktív állapotot kapnak. https://developer.samsung.com/one-ui/index.html
- Google / Material: legalább 48 dp-es érintési célterület ajánlott Androidon. A közeli gombok kattintható területe nem fedheti át egymást. https://support.google.com/accessibility/android/answer/7101858
- Material 3: közös tervezési változók segítségével következetes színek és állapotok. https://m3.material.io/foundations/
- Nielsen Norman Group: a rendszer állapotának láthatósága, következetesség és felismerhető műveletek. Konkrét városválasztó-felirat, profilban mentési tájékoztatás. https://www.nngroup.com/articles/ten-usability-heuristics/
- WCAG 2.2: a minimum célterület főszabályként 24 × 24 CSS px, kivételekkel; ez minimum, nem kényelmi cél. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

## Vizuális döntések

Megmarad az Inter és a márka kézírásos főcíme. A törzsszöveg 16 px, a szakaszcím 24 px, a profil csoportcíme 18 px, a navigáció felirata 11 px. Ezek saját tervezési döntések, nem platformkövetelmények.

A korall elsődleges műveleti színe #B83D32, fehér felirattal. A kiválasztott szűrő halvány korallos kitöltést, erős keretet és vastagabb szöveget kap. Sötét módban külön színek működnek. Az árnyék főként a lebegő navigáción jelöl térbeli különbséget.

A módosítások a ui-refinements.css fájlban alkotnak közös réteget. A korábbi style.css sok ismételt felülírást tartalmaz; annak teljes összevonása külön, vizuális regresszióellenőrzést igénylő feladat.

## Ellenőrzés és következő kör

Automatizált Edge mobilnézet: 320, 390, 768 és 1280 px, mind az öt fő nézet. Külön ellenőrizendő valódi iOS Safari és Android eszközön a nagyított szöveg, a billentyűzet és a hosszú eseményadatok viselkedése. Ez nem teljes akadálymentességi audit.

Következő tervezési kör: eseménykártyák információs sorrendje és a hiányzó adatok megjelenítése; keresési üres állapotok; részletek → jegyvásárlás útvonal; kedvelés utáni visszajelzés. A mostani kör az olvashatóság és a vezérlők alapjait javítja.

## Második kör: szín, tipográfia, térköz és kiemelt kártyák

A kiinduló 390 px-es nézetben 13 számított betűméret szerepelt az öt fő oldalon, a márkafeliratot és az időjárás-emojit is beleszámítva. Két betűcsalád van: Inter és Caveat. A kettő marad, az alapméretek szerepekhez kötöttek: 12 / 14 / 16 / 20 / 24 / 32 px. A mobil navigáció 11 px-es kompakt felirata, a kézírásos márkaszó és az időjárás ikonja tudatos kivétel.

Paletta: korall #FF6B5E (márka), sötét korall #B83D32 (művelet és kiemelt szöveg), halvány korall #FCE8E3 (kijelölés), meleg törtfehér #F7F5F2 (háttér), fehér #FFFFFF (felület), grafit #1B1D22 (szöveg). A főcím korábbi #C65A00 narancsa kikerült az aktív főcímből. A kategóriaikonok saját színei és a funkcionális állapotszínek nem márkaszínek.

Térközök: 8 px az összetartozó gombok között, 16 px kártyabelső, 24 px csoportok között és 40 px fő szakaszok között. A profil 20 px-es csoportcíme és a 32 px-es oldalcím elkülönül. A kiemelt cím nem foglal automatikusan két sornyi üres helyet.

A kiemelt képen a fehérítő réteg helyett rövid, 56 px-es maszkolt átmenet, 18 px-es elmosás és áttetsző sötét réteg biztosít hátteret a fehér szövegnek. A leírás a fix magasságú kártyában megmaradó területet kapja, ResizeObserver számolja az elférő teljes sorokat. Ha egy sor sem fér el, a rövid leírás rejtve marad; a teljes szöveg a részletezőben olvasható. A jelvények és a gomb mindig saját helyet kapnak.

Ellenőrzés: 320, 360, 390, 520, 768 és 1280 px; mind az öt nézet; hosszú tesztcímek és leírások; teljes sorok, gomboktól való távolság, vízszintes túlcsordulás és JavaScript-hibák vizsgálata. A külső eseményképek a helyi tesztkörnyezetben nem mind töltődnek be, ezért az elmosást változatos valódi fotókkal telefonon is érdemes megnézni.

Források a döntésekhez: https://www.nngroup.com/articles/principles-visual-design/ és https://codelabs.developers.google.com/customizing-material-color . A konkrét paletta és méretskála a Bee There számára hozott tervezési döntés.

## Végleges 60–30–10 paletta

Az app globális témája most a következő szín-tokeneket használja:

- Light: `#F8FAFC` domináns háttér, `#1E293B` strukturális pala és elsődleges műveleti szín.
- Dark: `#0F172A` domináns háttér, `#334155` kártya-, menü- és elsődleges gombfelület.

A kategóriaikonok saját színei információs jelölők, ezért nem részei a két alapszínnek. A navigációs sziget a háttér színét kapja, enyhén áttetsző és elmosott; az aktív fül a másodlagos palaszínű felületet használja. A fő műveleti gombok és kijelölt szűrők ugyanazt a palaszínt használják.

A véglegesített döntés szerint az elsődleges gombok, aktív szűrők, aktív navigációs fül és foglalási/részletek műveletek a sötét pala `#1E293B` (sötét módban `#334155`) színt használják. A telített kék kikerült a globális témából. A kedvelés külön, piros állapotjelzés marad.
