import json
import os
import urllib.request
import urllib.parse
import re
from bs4 import BeautifulSoup
import google.generativeai as genai

MEMORY_FILE = "events.json"
MAX_EVENTS = 30

api_key = os.environ.get("GEMINI_API_KEY")
model = None

if api_key:
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config={"response_mime_type": "application/json"}
        )
        print("✅ Gemini API Kulcs és AI Modell sikeresen betöltve!")
    except Exception as e:
        print(f"❌ Hiba a Gemini beállításakor: {e}")
else:
    print("❌ HIÁNYZÓ KULCS: A GEMINI_API_KEY nem található a GitHub Secrets-ben!")

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
        
        for tag in soup(['nav', 'header', 'footer', 'script', 'style', 'aside']):
            tag.decompose()
            
        page_text = soup.get_text(separator=' ', strip=True)[:3500]
        
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

        if not model:
            return None

        prompt = f"""
        Elemzed az alábbi magyar esemény weboldalának szövegét és képlinkjeit.
        
        Weboldal szövege:
        {page_text}
        
        Elérhető képlinkek:
        {json.dumps(image_candidates, ensure_ascii=False)}
        
        A feladatod egy JSON objektum létrehozása az alábbi mezőkkel:
        - "title": Esemény címe
        - "date": YYYY-MM-DD
        - "date_and_time": "YYYY-MM-DD HH:MM" vagy null
        - "price": "Ingyenes (Free)" vagy pontos ár (pl. "3 500 Ft")
        - "location": Helyszín neve vagy címe Székesfehérváron
        - "description": Tiszta 2-3 mondatos összefoglaló a programról
        - "categories": A legillőbb kategóriák tömbként kiválasztva ebből a listából: ["zene", "kultura", "muzeum", "turista", "sport", "detektiv", "romantikus", "luxus", "baratokkal"]
        - "header_image": A leginkább poszternek/plakátnak tűnő képlink a megadott képlinkek közül
        - "ticket_link": Ha fizetős az esemény, add meg ezt a linket: "{url}", ha ingyenes, legyen null
        """

        response = model.generate_content(prompt)
        
        event_json = json.loads(response.text)
        event_json["latitude"] = 47.1912
        event_json["longitude"] = 18.4095
        event_json["age_requirement"] = "Korhatár nélkül (All ages)"
        
        return event_json

    except Exception as e:
        print(f"⚠️ Hiba az esemény feldolgozásakor ({url}): {e}")
        return None

def main():
    links = fetch_events_from_programturizmus()
    print(f"🌐 {len(links)} esemény linkje megtalálva.")
    
    if not model:
        print("❌ Szakítás: Nincs működő Gemini AI modell. Ellenőrizd a GEMINI_API_KEY-t a GitHub Secrets-ben!")
        return

    events = []
    for i, link in enumerate(links, 1):
        event_data = process_event_with_ai(link)
        if event_data and event_data.get("title"):
            events.append(event_data)
            print(f"[{i}/{len(links)}] ✨ AI Feldolgozta: {event_data['title']} | Ár: {event_data['price']}")

    if events:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"💾 Kész! {len(events)} esemény elmentve a(z) {MEMORY_FILE} fájlba.")
    else:
        print("⚠️ Nem sikerült egyetlen eseményt sem feldolgozni.")

if __name__ == "__main__":
    main()
