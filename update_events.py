import json
import urllib.request
import urllib.parse
import re
from datetime import datetime
from bs4 import BeautifulSoup

MEMORY_FILE = "events.json"

# Magyar hónapok szótára a dátumkiolvasáshoz
MONTHS_HU = {
    'január': '01', 'januar': '01', 'jan': '01',
    'február': '02', 'februar': '02', 'feb': '02',
    'március': '03', 'marcius': '03', 'mar': '03',
    'április': '04', 'aprilis': '04', 'apr': '04',
    'május': '05', 'majus': '05', 'maj': '05',
    'június': '06', 'junius': '06', 'jun': '06',
    'július': '07', 'julius': '07', 'jul': '07',
    'augusztus': '08', 'aug': '08',
    'szeptember': '09', 'szep': '09', 'sept': '09',
    'október': '10', 'oktober': '10', 'okt': '10',
    'november': '11', 'nov': '11',
    'december': '12', 'dec': '12'
}

def load_memory():
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def purge_expired_events(events):
    today = datetime.now().date()
    valid_events = []
    
    for event in events:
        try:
            event_date = datetime.strptime(event["date"], "%Y-%m-%d").date()
            if event_date >= today:
                valid_events.append(event)
            else:
                print(f"🗑️ Purged expired event: {event.get('title')} ({event.get('date')})")
        except (ValueError, KeyError):
            valid_events.append(event)
            
    return valid_events

def parse_date_from_text(text):
    """Kiolvassa a valódi dátumot a magyar szövegből (pl. 2026. augusztus 14.)."""
    if not text:
        return None
    text_lower = text.lower()
    
    # Minta: 2026. augusztus 14
    pattern1 = r'(202[4-9])[\.\s\-]+([a-zöőúüűáéóí]+)[\.\s\-]+(\d{1,2})'
    match1 = re.search(pattern1, text_lower)
    if match1:
        year, month_str, day = match1.groups()
        month = MONTHS_HU.get(month_str.strip('.'))
        if month:
            return f"{year}-{month}-{int(day):02d}"
            
    # Minta: 2026-08-14 vagy 2026/08/14
    pattern2 = r'(202[4-9])[\/\-](\d{2})[\/\-](\d{2})'
    match2 = re.search(pattern2, text_lower)
    if match2:
        year, month, day = match2.groups()
        return f"{year}-{month}-{day}"

    return None

def extract_title_and_image(soup, page_url):
    """Kinyeri a pontos címet és a valódi borítóképet."""
    # --- CÍM MEGÁLLAPÍTÁSA ---
    title = ""
    h1 = soup.find("h1")
    if h1 and len(h1.get_text(strip=True)) > 2:
        title = h1.get_text(strip=True)
    else:
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"]
            
    # Ha a cím még mindig hiányos vagy általános, képezzünk nevet az URL-ből
    if not title or title.lower() in ["székesfehérvári program", "műsornaptár | szkkk", "esemény"]:
        slug_match = re.search(r'/event/([^/]+)', page_url) or re.search(r'/ajanlat-([^/]+)\.html', page_url)
        if slug_match:
            slug = slug_match.group(1)
            slug = re.sub(r'-\d{6}$', '', slug)  # Dátumkódok levágása
            words = slug.replace('-', ' ').split()
            title = " ".join([w.capitalize() for w in words])
            
    # Tisztítás
    title = title.replace(" - Programturizmus", "").replace(" | SZKKK", "").strip()

    # --- KÉP MEGÁLLAPÍTÁSA ---
    generic_logos = ["programturizmus_og.jpg", "szkk_noimage.jpg", "default", "logo"]
    image_url = ""

    # 1. Keresés a cikk törzsében / galériájában lévő képek között
    for img in soup.find_all("img", src=True):
        src = img["src"]
        if not any(bad in src.lower() for bad in generic_logos):
            if any(good in src.lower() for good in ["wp-content/uploads", "images/ajanlat", "images/partner", "/media/", "uploads"]):
                if src.startswith("//"):
                    image_url = "https:" + src
                elif src.startswith("/"):
                    parsed_base = urllib.parse.urlparse(page_url)
                    image_url = f"{parsed_base.scheme}://{parsed_base.netloc}{src}"
                else:
                    image_url = src
                break

    # 2. Ha a törzsben nem volt egyedi kép, próbáljuk meg az og:image-et
    if not image_url:
        og_image = soup.find("meta", property="og:image")
        if og_image and og_image.get("content"):
            content = og_image["content"]
            if not any(bad in content.lower() for bad in generic_logos):
                image_url = content if not content.startswith("//") else "https:" + content

    if not image_url:
        image_url = "https://fehervariprogram.hu/wordpress/wp-content/uploads/2021/04/szkk_noimage.jpg"

    return title, image_url

def parse_generic_event_page(url):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        # Cím és Kép kinyerése
        title_str, header_image = extract_title_and_image(soup, url)
        
        # Leírás
        desc_meta = soup.find("meta", property="og:description")
        desc_str = desc_meta["content"] if desc_meta else soup.get_text()[:200]
        desc_str = re.sub(r'\s+', ' ', desc_str).strip()

        # Dátum megállapítása
        start_date = None
        
        # 1. Próbálkozás JSON-LD-ből
        for json_script in soup.find_all("script", type="application/ld+json"):
            if not json_script.string:
                continue
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                if "startDate" in data:
                    start_date = data["startDate"].split("T")[0]
                    break
            except Exception:
                continue

        # 2. Ha nincs JSON-LD, kiolvasás a szövegből / leírásból
        if not start_date:
            start_date = parse_date_from_text(desc_str) or parse_date_from_text(soup.get_text()[:1000])

        # Ha így sem található, állítsuk be a mai napot
        if not start_date:
            start_date = datetime.now().strftime("%Y-%m-%d")

        return {
            "title": title_str,
            "location": "Székesfehérvár",
            "latitude": 47.1912,
            "longitude": 18.4095,
            "date": start_date,
            "description": desc_str[:250] + "...",
            "price": "Esemény részletei a linken",
            "header_image": header_image,
            "ticket_link": url
        }
    except Exception as e:
        print(f"⚠️ Could not parse {url}: {e}")
        return None

def search_programturizmus():
    urls = []
    search_url = "https://www.programturizmus.hu/ajanlat-szekesfehervari-programok.html"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        req = urllib.request.Request(search_url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if '/ajanlat-' in href and href != search_url:
                full_url = f"https://www.programturizmus.hu{href}" if href.startswith('/') else href
                if full_url not in urls:
                    urls.append(full_url)
    except Exception as e:
        print(f"⚠️ Programturizmus search failed: {e}")
    return urls

def search_fehervari_programok():
    urls = []
    search_url = "https://fehervariprogram.hu/musornaptar/"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        req = urllib.request.Request(search_url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if 'fehervariprogram.hu/' in href and ('/event/' in href or '/2026/' in href) and '/cat_ids' not in href:
                if href not in urls:
                    urls.append(href)
    except Exception as e:
        print(f"⚠️ FehervariProgram search failed: {e}")
    return urls

def main():
    # 1. Tisztítás: Töröljük a korábbi hibás/csonkított adatsorokat a frissítéshez
    active_memory = []
    known_urls = set()

    discovered_urls = set()
    discovered_urls.update(search_programturizmus())
    discovered_urls.update(search_fehervari_programok())

    added_count = 0
    for url in list(discovered_urls):
        if url not in known_urls:
            event_data = parse_generic_event_page(url)
            if event_data:
                active_memory.append(event_data)
                known_urls.add(url)
                added_count += 1
                print(f"✨ Event added: {event_data['title']} | Date: {event_data['date']}")

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(active_memory, f, ensure_ascii=False, indent=2)

    print(f"💾 Finished! Cleaned and saved {len(active_memory)} detailed events to events.json.")

if __name__ == "__main__":
    main()
