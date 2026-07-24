import json
import os
import urllib.request
import urllib.parse
import re
import time
from bs4 import BeautifulSoup
import google.generativeai as genai

MEMORY_FILE = "events.json"
MAX_EVENTS = 15  # 15 esemény feldolgozása AI-val (pontosan belefér az 1 perces ingyenes keretbe)

GEO_CACHE = {}

# Gemini AI Konfiguráció
api_key = os.environ.get("GEMINI_API_KEY")
model = None

if api_key:
    try:
        genai.configure(api_key=api_key)
        # Szigorú JSON válaszadási mód bekapcsolása
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config={"response_mime_type": "application/json"}
        )
        print("✅ Gemini AI sikeresen csatlakoztatva!")
    except Exception as e:
        print(f"❌ Gemini indítási hiba: {e}")
else:
    print("❌ HIÁNYZÓ KULCS: A GEMINI_API_KEY nem található a GitHub Secrets között!")

def get_headers():
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8'
    }

def geocode_address(address):
    """A megtalált utcanév alapján lekéri a pontos GPS koordinátákat."""
    if not address or address == "Székesfehérvár":
        return 47.1912, 18.4095

    if address in GEO_CACHE:
        return GEO_CACHE[address]

    try:
        encoded_addr = urllib.parse.quote(address)
        url = f"https://nominatim.openstreetmap.org/search?q={encoded_addr}&format=json&limit=1"
        headers = {'User-Agent': 'BeeThereApp/1.0 (contact@beethere.local)'}
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=3).read().decode('utf-8')
        data = json.loads(html)

        if data and len(data) > 0:
            coords = (float(data[0]["lat"]), float(data[0]["lon"]))
            GEO_CACHE[address] = coords
            return coords
    except Exception:
        pass

    return 47.1912, 18.4095

def fetch_event_links():
    """Összegyűjti az események egyedi linkjeit."""
    url = "https://www.programturizmus.hu/ajanlat-szekesfehervari-programok.html"
    try:
        req = urllib.request.Request(url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if '/ajanlat-' in href and href != url:
                full_url = f"https://www.programturizmus.hu{href}" if href.startswith('/') else href
                if full_url not in links:
                    links.append(full_url)
        return links[:MAX_EVENTS]
    except Exception as e:
        print(f"⚠️ Link gyűjtési hiba: {e}")
        return []

def process_event_with_ai(url):
    """Letölti az oldalt, átadja a Gemini AI-nak, ami visszadja a strukturált JSON-t."""
    try:
        req = urllib.request.Request(url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=8).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        # Töröljük a menüket, láblécet
        for tag in soup(['nav', 'header', 'footer', 'script', 'style', 'aside']):
            tag.decompose()
            
        page_text = soup.get_text(separator=' ', strip=True)[:3500]
        
        # Képlinkek kigyűjtése az AI számára
        image_candidates = []
        for img in soup.find_all('img', src=True):
            src = img['src']
            if not any(bad in src.lower() for bad in ['logo', 'banner', 'icon', 'avatar', 'programturizmus_og']):
                full_img = f"https://www.programturizmus.hu{src}" if src.startswith('/') else src
                if full_img not in image_candidates:
                    image_candidates.append(full_img)
                    
        og_img = soup.find('meta', property='og:image')
        if og_img and og_img.get('content') and "programturizmus_og" not in og_img['content']:
            image_candidates.append(og_img['content'])

        if not model:
            return None

        prompt = f"""
        Te egy intelligens eseményfeldolgozó asszisztens vagy.
        Elemzed az alábbi magyar esemény weboldalának szövegét és képlinkjeit.

        Weboldal szövege:
        {page_text}

        Elérhető képlinkek a weboldalról:
        {json.dumps(image_candidates, ensure_ascii=False)}

        A feladatod egy JSON objektum visszaadása a következő pontos mezőkkel:
        1. "title": Az esemény pontos címe.
        2. "date": Az esemény kezdő dátuma YYYY-MM-DD formátumban (pl. "2026-07-21").
        3. "date_and_time": Ha van pontos óra/perc, akkor "YYYY-MM-DD HH:MM", különben null.
        4. "price": Ha ingyenes, pontosan "Ingyenes (Free)". Ha fizetős, add meg a pontos árat (pl. "3 500 Ft" vagy "Jegyárak a linken").
        5. "location": A pontos helyszín neve és utca, házszám Székesfehérváron (pl. "Verseci u. 1." vagy "Gorsium Régészeti Park, Tác"). Ne csak annyit írj, hogy "Székesfehérvár", ha a szövegben ott a pontos utca!
        6. "description": Tiszta, nyelvtanilag helyes 2-3 mondatos összefoglaló a programról.
        7. "categories": Válaszd ki a legillőbbeket tömbként ebből a listából: ["zene", "kultura", "muzeum", "turista", "sport", "detektiv", "romantikus", "luxus", "baratokkal"].
        8. "header_image": Válaszd ki a megadott képlinkek közül a leginkább az esemény saját plakátjának/poszterének tűnőt! Ha nincs jó kép a listában, válaszd ezt: "https://fehervariprogram.hu/wordpress/wp-content/uploads/2021/04/szkk_noimage.jpg".
        9. "ticket_link": Ha fizetős az esemény, add meg ezt az URL-t: "{url}", ha ingyenes, legyen null.
        10. "age_requirement": "Korhatár nélkül (All ages)" vagy ha van megadva korhatár (pl. "18+").
        11. "additional_info": Egy objektum a következő mezőkkel: 
            - "weboldal": "{url}"
            - "email": Ha van a szövegben e-mail cím, különben null
            - "telefon": Ha van a szövegben telefonszám, különben null
        """

        response = model.generate_content(prompt)
        
        # Tisztítás a biztonság kedvéért (ha az AI mégis markdown jelet tenne bele)
        raw_text = response.text.strip()
        clean_json_str = re.sub(r'```json\s*|```\s*', '', raw_text)
        match = re.search(r'\{.*\}', clean_json_str, re.DOTALL)
        
        if match:
            event_json = json.loads(match.group(0))
        else:
            event_json = json.loads(raw_text)

        # GPS Koordináta lekérése az AI által megtalált utca alapján
        loc_text = event_json.get("location", "Székesfehérvár")
        full_address = f"Székesfehérvár, {loc_text}" if "Székesfehérvár" not in loc_text and "Tác" not in loc_text else loc_text
        lat, lon = geocode_address(full_address)

        event_json["latitude"] = lat
        event_json["longitude"] = lon

        return event_json

    except Exception as e:
        print(f"❌ AI Feldolgozási hiba ({url}): {e}")
        return None

def main():
    links = fetch_event_links()
    print(f"🌐 {len(links)} esemény feldolgozása elindult a Gemini AI-val...")

    if not model:
        print("❌ Szakítás: Nincs működő Gemini AI kliens. Ellenőrizd a GEMINI_API_KEY-t a Secrets-ben!")
        return

    events = []
    for i, link in enumerate(links, 1):
        print(f"[{i}/{len(links)}] AI elemzi: {link}...")
        event_data = process_event_with_ai(link)
        
        if event_data and event_data.get("title"):
            events.append(event_data)
            print(f"    ✨ AI Válaszolt: {event_data['title']} | Cím: {event_data['location']} | Dátum: {event_data['date']}")
        
        # KÖTELEZŐ 4.5 MÁSODPERCES SZÜNET az ingyenes AI API korlát (15 RPM) miatt!
        time.sleep(4.5)

    if events:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"\n💾 SIKER! {len(events)} eseményt dolgozott fel az AI, és mentett el az {MEMORY_FILE} fájlba.")
    else:
        print("\n⚠️ Nem sikerült adatot kinyerni az AI-val.")

if __name__ == "__main__":
    main()
