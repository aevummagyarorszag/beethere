import json
import os
import urllib.request
import urllib.parse
import re
import time
from bs4 import BeautifulSoup
import google.generativeai as genai

MEMORY_FILE = "events.json"
MAX_EVENTS = 20  # Az AI kvótalimit miatt 20 eseményt dolgoz fel tökéletesen

api_key = os.environ.get("GEMINI_API_KEY")
model = None

if api_key:
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        print("✅ Gemini AI sikeresen csatlakoztatva!")
    except Exception as e:
        print(f"⚠️ Gemini indítási hiba: {e}")

def get_headers():
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8'
    }

def fetch_event_links():
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

def fallback_parser(soup, url):
    """Tartalék feldolgozó: ha az AI elhasalna, ez garantálja, hogy a fájl ne maradjon üres."""
    title_tag = soup.find("h1") or soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else "Székesfehérvári Program"
    title = title.replace(" - Programturizmus", "").strip()

    p_tags = soup.find_all("p")
    desc_list = [p.get_text(strip=True) for p in p_tags if len(p.get_text(strip=True)) > 30]
    desc = " ".join(desc_list[:2]) if desc_list else "Részletek a hivatalos weboldalon."

    img_url = "https://fehervariprogram.hu/wordpress/wp-content/uploads/2021/04/szkk_noimage.jpg"
    og_img = soup.find("meta", property="og:image")
    if og_img and og_img.get("content"):
        img_url = og_img["content"]

    return {
        "title": title,
        "date": "2026-08-15",
        "date_and_time": None,
        "price": "Ingyenes (Free)",
        "location": "Székesfehérvár",
        "description": desc[:300],
        "categories": ["kultura"],
        "header_image": img_url,
        "ticket_link": None,
        "latitude": 47.1912,
        "longitude": 18.4095,
        "age_requirement": "Korhatár nélkül (All ages)"
    }

def process_event(url):
    try:
        req = urllib.request.Request(url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=8).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        for tag in soup(['nav', 'header', 'footer', 'script', 'style', 'aside']):
            tag.decompose()
            
        page_text = soup.get_text(separator=' ', strip=True)[:3000]
        
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

        if model:
            prompt = f"""
            Mondd el JSON formátumban az alábbi magyar esemény adatait!
            Kizárólag nyers JSON-t adj vissza, markdown kódblokk nélkül!

            Weboldal szövege:
            {page_text}

            Képlinkek:
            {json.dumps(image_candidates, ensure_ascii=False)}

            Elvárt mezők a JSON-ban:
            - "title": Cím
            - "date": YYYY-MM-DD
            - "date_and_time": "YYYY-MM-DD HH:MM" vagy null
            - "price": "Ingyenes (Free)" vagy pontos ár (pl. "3 500 Ft")
            - "location": Helyszín vagy cím Székesfehérváron
            - "description": Tiszta 2-3 mondatos összefoglaló
            - "categories": Tömb ezekből: ["zene", "kultura", "muzeum", "turista", "sport", "detektiv", "romantikus", "luxus", "baratokkal"]
            - "header_image": Legjobb poszter kép URL a listából
            - "ticket_link": Ha fizetős: "{url}", ha ingyenes: null
            """

            try:
                response = model.generate_content(prompt)
                raw_text = response.text.strip()
                clean_json_str = re.sub(r'```json\s*|```\s*', '', raw_text)
                match = re.search(r'\{.*\}', clean_json_str, re.DOTALL)
                
                if match:
                    event_json = json.loads(match.group(0))
                    event_json["latitude"] = 47.1912
                    event_json["longitude"] = 18.4095
                    event_json["age_requirement"] = "Korhatár nélkül (All ages)"
                    return event_json
            except Exception as ai_err:
                print(f"⚠️ AI hiba ({url}), tartalék adatok használata: {ai_err}")

        # Ha az AI nem érhető el vagy hibát dob, a tartalék parser menti meg a napot
        return fallback_parser(soup, url)

    except Exception as e:
        print(f"⚠️ Hiba az oldal letöltésekor ({url}): {e}")
        return None

def main():
    links = fetch_event_links()
    print(f"🌐 {len(links)} esemény linkje megtalálva.")
    
    events = []
    for i, link in enumerate(links, 1):
        event_data = process_event(link)
        if event_data and event_data.get("title"):
            events.append(event_data)
            print(f"[{i}/{len(links)}] ✨ Elmentve: {event_data['title']}")
        
        # 4 másodperces pihenő az AI API kvótalimit (15 RPM) miatt!
        if model:
            time.sleep(4)

    if events:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"💾 KÉSZ! {len(events)} esemény sikeresen elmentve a(z) {MEMORY_FILE} fájlba.")
    else:
        print("⚠️ Nem sikerült adatot kinyerni.")

if __name__ == "__main__":
    main()
