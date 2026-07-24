import json
import os
import urllib.request
import urllib.parse
import re
from bs4 import BeautifulSoup
from google import genai
from google.genai import types

MEMORY_FILE = "events.json"
MAX_EVENTS = 30

# Gemini AI Kliens inicializálása
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

def get_headers():
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8'
    }

def fetch_events_from_programturizmus():
    url = "https://www.programturizmus.hu/ajanlat-szekesfehervari-programok.html"
    try:
        req = urllib.request.Request(url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=8).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        event_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if '/ajanlat-' in href and href != url:
                full_url = f"https://www.programturizmus.hu{href}" if href.startswith('/') else href
                if full_url not in event_links:
                    event_links.append(full_url)
        return event_links[:MAX_EVENTS]
    except Exception as e:
        print(f"⚠️ Hiba a linkek gyűjtésénél: {e}")
        return []

def process_event_with_ai(url):
    try:
        req = urllib.request.Request(url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=6).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        # 1. PYTHON: Töröljük a felesleges menüket
        for tag in soup(['nav', 'header', 'footer', 'script', 'style', 'aside']):
            tag.decompose()
            
        page_text = soup.get_text(separator=' ', strip=True)[:4000] # Tiszta szöveg az AI-nak
        
        # 2. PYTHON: Kigyűjtjük az összes lehetséges képlinket az AI számára
        image_candidates = []
        for img in soup.find_all('img', src=True):
            src = img['src']
            if any(good in src.lower() for good in ['plakat', 'show', 'media', 'uploads', 'poster']):
                full_img = f"https://www.programturizmus.hu{src}" if src.startswith('/') else src
                if full_img not in image_candidates:
                    image_candidates.append(full_img)
                    
        og_img = soup.find('meta', property='og:image')
        if og_img and og_img.get('content'):
            image_candidates.append(og_img['content'])

        if not client:
            print("⚠️ Nincs GEMINI_API_KEY beállítva!")
            return None

        # 3. AI: Megkérjük a Geminit, hogy dolgozza fel az adatokat és válassza ki a képet
        prompt = f"""
        Elemzed az alábbi magyar esemény weboldalának szövegét és képlinkjeit.
        
        Weboldal szövege:
        {page_text}
        
        Elérhető képlinkek:
        {json.dumps(image_candidates, ensure_ascii=False)}
        
        A feladatod:
        1. Hozz létre egy strukturált JSON objektumot az eseményről!
        2. Dátum formátum: YYYY-MM-DD. Ha van pontos időpont, date_and_time: "YYYY-MM-DD HH:MM", különben null.
        3. Ár: Ha ingyenes, pontosan "Ingyenes (Free)". Ha fizetős, add meg a pontos árat (pl. "3 500 Ft" vagy "Jegyárak a linken").
        4. Cím/Utca: Pontos székesfehérvári cím utca házszámmal, ha megtalálható.
        5. Kategóriák: Válaszd ki a legillőbbeket ezek közül: ["zene", "kultura", "muzeum", "turista", "sport", "detektiv", "romantikus", "luxus", "baratokkal"].
        6. Poszter kép (header_image): Válaszd ki a megadott képlinkek közül a leginkább esemény-poszternek tűnőt! Ha egyik sem jó, használd ezt: "https://fehervariprogram.hu/wordpress/wp-content/uploads/2021/04/szkk_noimage.jpg".
        7. Ticket link: Ha fizetős az esemény, add meg a weboldal URL-jét: "{url}". Ha ingyenes, legyen null.
        """

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        
        event_json = json.loads(response.text)
        
        # Alapértelmezett koordináták hozzáadása
        event_json["latitude"] = 47.1912
        event_json["longitude"] = 18.4095
        
        return event_json

    except Exception as e:
        print(f"⚠️ AI Feldolgozási hiba ({url}): {e}")
        return None

def main():
    links = fetch_events_from_programturizmus()
    print(f"🌐 {len(links)} esemény átadása a Gemini AI-nak...")
    
    events = []
    for i, link in enumerate(links, 1):
        event_data = process_event_with_ai(link)
        if event_data and event_data.get("title"):
            events.append(event_data)
            print(f"[{i}/{len(links)}] ✨ AI Feldolgozta: {event_data['title']} | Ár: {event_data['price']}")

    if events:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"💾 Kész! {len(events)} tökéletes esemény elmentve az events.json-ba.")

if __name__ == "__main__":
    main()
