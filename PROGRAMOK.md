# Programok a Google Sheets táblából

A meglévő táblába egy új **Típus** oszlop kerülhet (az angol **Type** név is működik).

- **egyszeri** vagy üres: esemény a főoldalon és a naptárban, a korábbi működéssel.
- **állandó**: az Állandó lehetőségek oldalon jelenik meg; nem kerül a dátumos főoldali és naptári listákba.

Mindkét típus kereshető, kedvelhető és megosztható. Az állandó programok ugyanazt a kártyasablont használják.

Egyszeri eseménynél a Date mezőben egy nap vagy zárt dátumtartomány adható meg, például `2026.11.14` vagy `2026.11.14-2026.11.16`. A tartomány mindkét szélső napot tartalmazza; az esemény a naptárban és a dátum szerinti keresésben minden érintett napon megjelenik.

Állandó programnál a Date mezőben a hét napjai adhatók meg. Például `hétfő-péntek` minden hétköznapot jelent, a `hétfő, szerda, péntek` pedig csak ezt a három napot. A `hétköznap`, `hétvége` és `minden nap` megadás is használható. A Date üresen is maradhat; ekkor a program minden napra érvényes. A Time mezőben nyitvatartás is megadható. A Ticket Link mezőbe a foglalási oldal címe kerül: a gomb felirata **Foglalás**. Link nélkül nincs foglalásgomb. A többi oszlop (Title, Location, Header Image, Description, Price stb.) változatlan.

A meglévő update_events.py importáló a típusmezőt is átemeli az events.json fájlba. A táblázat új sorai a meglévő adatfrissítés után jelennek meg. A Google Sheets táblát ez a kódmódosítás nem szerkeszti.
