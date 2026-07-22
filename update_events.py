import json
import urllib.request
import urllib.parse
import re
from datetime import datetime
from bs4 import BeautifulSoup

MEMORY_FILE = "events.json"

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

def parse_date_from_text(text):
    if not text:
        return None
    text_lower = text.lower()
    
    pattern1 = r'(202[4-9])[\.\s\-]+([a-zöőúüűáéóí]+)[\.\s\-]+(\d{1,2})'
    match1 = re.search(pattern1, text_lower)
    if match1:
        year, month_str, day = match1.groups()
        month = MONTHS_HU.get(month_str.strip('.'))
        if month:
            return f"{year}-{month}-{int(day):02d}"
            
    pattern2 = r'(202[4-9])[\/\-](\d{2})[\/\-](\d{2})'
    match2 = re.search(pattern2, text_lower)
    if match2:
        year, month, day = match2.groups()
        return f"{year}-{month}-{day}"

    return None

def extract_price(text):
    if not text:
        return "Esemény részletei a linken"
    text_lower = text.lower()
    
    if any(free in text_lower for free in ["ingyenes", "díjmentes", "ingyen", "belépés díjtalan", "ingyenesen"]):
        return "Ingyenes (Free)"
        
    price_match = re.search(r'(\d[\d\s\.]*\s*ft)', text_lower)
    if price_match:
        return price_match.group(1).upper()
        
    return "Esemény részletei a linken"

def extract_specific_location(soup, text):
    common_venues = [
        "Bory-vár", "Hiemer-ház", "Városház tér", "Zichy liget", "Csónakázó-tó", 
        "Jancsárkert", "Koronás Park", "Vörösmarty Színház", "Nyolcas Műhely", 
        "Alba Regia Sportcsarnok", "MET Aréna", "Köfém Művelődési Központ", 
        "Feketehegy-Szárazréti Közösségi Ház", "Gorsium", "Bory-tér", "Országzászló tér"
    ]
    for venue in common_venues:
        if venue.lower() in text.lower():
            return f"{venue}, Székesfehérvár"

    return "Székesfehérvár"

def extract_clean_poster_image(soup, page_url):
    """
    Intelligens reklámmentesítő képszűrő:
    1. Kitörli a HTML-ből az oldalsávokat, lábléceket, reklámblokkokat.
    2. Megkeresi a hivatalos JSON-LD 'image' mezőt.
    3. Súlyozott pontozással választja ki a valódi plakátot.
    """
    # --- 1. HTML MŰTÉT: Eltávolítjuk a reklámokat rejtő elemeket ---
    clean_soup = BeautifulSoup(str(soup), 'html.parser')
    noise_selectors = [
        'aside', 'footer', 'header', 'nav',
        '.sidebar', '.reklam', '.ads', '.banner', '.related', 
        '.recommended', '.partner-box', '.hotel-box', '.special'
    ]
    for selector in noise_selectors:
        for element in clean_soup.select(selector):
            element.decompose()

    # --- 2. JSON-LD HI VAHATOS ADATSTRUKTÚRA ---
    for json_script in clean_soup.find_all("script", type="application/ld+json"):
        if json_script.string:
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                if isinstance(data, dict) and "image" in data:
                    img_data = data["image"]
                    if isinstance(img_data, list) and len(img_data) > 0:
                        img_data = img_data[0]
                    if isinstance(img_data, dict):
                        img_data = img_data.get("url", "")
                    if isinstance(img_data, str) and img_data.startswith("http"):
                        if not any(b in img_data.lower() for b in ["banner", "hotel", "partner", "logo", "lakeside"]):
                            return img_data
            except Exception:
                pass

    # --- 3. SÚLYOZOTT PONTOZÁSI RENDSZER ---
    blacklist = [
        "banner", "hotel", "partner", "szallas", "advertisement", "reklam", 
        "programturizmus_og.jpg", "szkk_noimage.jpg", "logo", "icon", "avatar",
        "best-western", "lakeside", "karolyi-kastely", "special/bannerhead", "list/partner"
    ]

    whitelist = ["plakat", "media/image/show", "wp-content/uploads", "event", "cover", "poster", "media/image/plakat"]

    candidates = []
    for img in clean_soup.find_all("img", src=True):
        src = img["src"]
        src_lower = src.lower()

        # Feketelistás képek azonnali eldobása
        if any(bad in src_lower for bad in blacklist):
            continue

        score = 0
        if any(good in src_lower for good in whitelist):
            score += 10

        # Abszolút URL képzés
        if src.startswith("//"):
            full_src = "https:" + src
        elif src.startswith("/"):
            parsed_base = urllib.parse.urlparse(page_url)
            full_src = f"{parsed_base.scheme}://{parsed_base.netloc}{src}"
        else:
            full_src = src

        candidates.append((score, full_src))

    # Rendezés pontszám szerint
    candidates.sort(key=lambda x: x[0], reverse=True)

    if candidates:
        return candidates[0][1]

    # --- 4. TARTALÉK OG:IMAGE ---
    og_image = clean_soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        og_src = og_image["content"]
        if not any(bad in og_src.lower() for bad in blacklist):
            return og_src if not og_src.startswith("//") else "https:" + og_src

    return "https://fehervariprogram.hu/wordpress/wp-content/uploads/2021/04/szkk_noimage.jpg"

def parse_generic_event_page(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        title_tag = soup.find("h1") or soup.find("meta", property="og:title")
        title_str = title_tag.get_text(strip=True) if hasattr(title_tag, 'get_text') else title_tag.get("content", "")
        
        if "biztonsági ellenőrzés" in title_str.lower() or "robot" in title_str.lower():
            print(f"⚠️ Captcha detected for {url}, skipping.")
            return None

        title_str = title_str.replace(" - Programturizmus", "").replace(" | SZKKK", "").strip()

        desc_meta = soup.find("meta", property="og:description")
        desc_str = desc_meta["content"] if desc_meta else soup.get_text()[:300]
        desc_str = re.sub(r'\s+', ' ', desc_str).strip()

        full_text = soup.get_text()

        price_str = extract_price(full_text)
        location_str = extract_specific_location(soup, full_text)
        header_image = extract_clean_poster_image(soup, url)

        start_date = parse_date_from_text(desc_str) or parse_date_from_text(full_text[:1200]) or datetime.now().strftime("%Y-%m-%d")

        return {
            "title": title_str,
            "location": location_str,
            "latitude": 47.1912,
            "longitude": 18.4095,
            "date": start_date,
            "description": desc_str[:250] + "...",
            "price": price_str,
            "header_image": header_image,
            "ticket_link": url
        }
    except Exception as e:
        print(f"⚠️ Could not parse {url}: {e}")
        return None

def search_programturizmus():
    urls = []
    search_url = "https://www.programturizmus.hu/ajanlat-szekesfehervari-programok.html"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
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
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
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
    active_memory = []
    known_urls = set()

    discovered_urls = set()
    discovered_urls.update(search_programturizmus())
    discovered_urls.update(search_fehervari_programok())

    for url in list(discovered_urls):
        if url not in known_urls:
            event_data = parse_generic_event_page(url)
            if event_data:
                active_memory.append(event_data)
                known_urls.add(url)
                print(f"✨ Poster verified: {event_data['title']} | Image: {event_data['header_image']}")

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(active_memory, f, ensure_ascii=False, indent=2)

    print(f"💾 Cleaned memory with {len(active_memory)} events.")

if __name__ == "__main__":
    main()
