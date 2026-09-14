# Programok a Google Sheets táblából

A meglévő táblába egy új **Típus** oszlop kerülhet (az angol **Type** név is működik).

- **egyszeri** vagy üres: esemény a főoldalon és a naptárban, a korábbi működéssel.
- **állandó**: az Állandó lehetőségek oldalon jelenik meg; nem kerül a dátumos főoldali és naptári listákba.

Mindkét típus kereshető, kedvelhető és megosztható. Az állandó programok ugyanazt a kártyasablont használják.

Állandó programnál a Date üresen maradhat. A Time mezőben nyitvatartás is megadható. A Ticket Link mezőbe a foglalási oldal címe kerül: a gomb felirata **Foglalás**. Link nélkül nincs foglalásgomb. A többi oszlop (Title, Location, Header Image, Description, Price stb.) változatlan.

A meglévő update_events.py importáló a típusmezőt is átemeli az events.json fájlba. A táblázat új sorai a meglévő adatfrissítés után jelennek meg. A Google Sheets táblát ez a kódmódosítás nem szerkeszti.
