import json
import urllib.request
import urllib.parse
import re
import time
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

KNOWN_VENUES = {
    "bory-vár": ("Bory-vár, Székesfehérvár", 47.2023, 18.4583),
    "hiemer": ("Hiemer-ház, Székesfehérvár", 47.1911, 18.4088),
    "városház tér": ("Városház tér, Székesfehérvár", 47.1915, 18.4096),
    "zichy liget": ("Zichy liget, Székesfehérvár", 47.1948, 18.4087),
    "csónakázó-tó": ("Csónakázó-tó, Székesfehérvár", 47.1970, 18.4005),
    "jancsárkert": ("Jancsárkert, Székesfehérvár", 47.1856, 18.4112),
    "vörösmarty színház": ("Vörösmarty Színház, Székesfehérvár", 47.1901, 18.4083),
    "nyolcas műhely": ("Nyolcas Műhely, Székesfehérvár", 47.1865, 18.4180),
    "alba regia sportcsarnok": ("Alba Regia Sportcsarnok, Székesfehérvár", 47.1825, 18.4182),
    "met aréna": ("MET Aréna, Székesfehérvár", 47.1720, 18.4350),
    "köfém": ("Köfém Művelődési Ház, Székesfehérvár", 47.1790, 18.4410),
    "feketehegy": ("Feketehegy-Szárazréti Közösségi Ház, Székesfehérvár", 47.2065, 18.3750),
    "gorsium": ("Gorsium Régészeti Park, Tác", 47.0945, 18.4320)
}

def load_memory():
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def get_headers():
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
    }

def geocode_address(address):
    if not address or address == "Székesfehérvár":
        return 47.1912, 18.4095

    try:
        encoded_addr = urllib.parse.quote(address)
        url = f"https://nominatim.openstreetmap.org/search?q={encoded_addr}&format=json&limit=1"
        headers = {'User-Agent': 'BeeThereApp/1.0 (contact@beethere.local)'}
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=5).read().decode('utf-8')
        data = json.loads(html)

        if data and len(data) > 0:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"⚠️ Geocoding hiba ('{address}'): {e}")

    return 47.1912, 18.4095

def extract_categories(title, description, full_text):
    text_lower = f"{title} {description}".lower()
    matched_categories = set()

    keywords_map = {
        "zene": [
            "koncert", "együttes", "zenekar", "fellépő", "akusztik", "szimfonikus", 
            "dal", "énekes", "dj", "party", "buli", "zenés", "katonazene", "orgona", 
            "harmonia albensis", "live band", "zenei"
        ],
        "kultura": [
            "színház", "előadás", "tánc", "néptánc", "irodalom", "vers", "opera", 
            "operett", "balett", "kultúra", "könyv", "dráma", "dumaszínház", 
            "stand-up", "óriásbáb", "komédia", "tragédia"
        ],
        "muzeum": [
            "múzeum", "kiállítás", "tárlat", "galéria", "régészeti", "műtárgy", 
            "művészet", "fotókiállítás", "totus tuus", "gorsium"
        ],
        "turista": [
            "városnézés", "túra", "idegenvezetés", "felfedező séta", "kirándulás", 
            "látnivaló", "műemlék", "vár", "kastély", "turista", "fáklyás idegenvezetés",
            "kisvonat", "ökotúra", "legendák"
        ],
        "sport": [
            "sport", "futás", "foci", "mérkőzés", "bajnokság", "torna", "fitness", 
            "sárkányhajó", "repülőnap", "légiparádé", "meccs", "aréna", "sportcsarnok"
        ],
        "detektiv": [
            "szabadulószoba", "rejtély", "nyomozás", "logikai kalandozás", "fejtörő", 
            "detektív", "titok", "pince", "kajla kalandok", "küldetés"
        ],
        "romantikus": [
            "romantikus", "pároknak", "naplemente", "kettesben", "vacsora", 
            "borkóstoló", "csónakázás", "éjszakai séta", "bory-vár"
        ],
        "luxus": [
            "vip", "gála", "exkluzív", "luxus", "premium", "gourmet", 
            "champagne", "díszelőadás"
        ],
        "baratokkal": [
            "fesztivál", "kocsma", "kvíz", "dumaszínház", "stand-up", 
            "sörfesztivál", "lecsófesztivál", "vásár", "mulatság", "mézünnep", 
            "nyolcas műhely"
        ]
    }

    for cat, keywords in keywords_map.items():
        if any(kw in text_lower for kw in keywords):
            matched_categories.add(cat)

    if not matched_categories:
        matched_categories.add("kultura")

    return list(matched_categories)

def parse_date_and_time(text):
    if not text:
        date_str = datetime.now().strftime("%Y-%m-%d")
        return date_str, None
    
    date_str = None
    
    match_dot = re.search(r'(202[4-9])\.\s*(\d{1,2})\.\s*(\d{1,2})\.?', text)
    if match_dot:
        y, m, d = match_dot.groups()
        date_str = f"{y}-{int(m):02d}-{int(d):02d}"

    if not date_str:
        text_lower = text.lower()
        match_hu = re.search(r'(202[4-9])[\.\s\-]+([a-zöőúüűáéóí]+)[\.\s\-]+(\d{1,2})', text_lower)
        if match_hu:
            y, m_str, d = match_hu.groups()
            m = MONTHS_HU.get(m_str.strip('.'))
            if m:
                date_str = f"{y}-{m}-{int(d):02d}"

    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")

    text_clean_for_time = re.sub(r'202[4-9][\.\/\-]\d{1,2}[\.\/\-]\d{1,2}', '', text)
    text_clean_for_time = re.sub(r'\d{1,2}[\.\/\-]\d{1,2}\.?', '', text_clean_for_time)

    time_match = re.search(r'\b([0-1]?[0-9]|2[0-3])[:\.]([0-5][0-9])\s*(?:óra|órakor|h)?\b|\b([0-1]?[0-9]|2[0-3])\s*(?:óra|órakor)\b', text_clean_for_time, re.IGNORECASE)
    
    date_and_time_str = None
    if time_match:
        if time_match.group(1) and time_match.group(2):
            hour = int(time_match.group(1))
            minute = time_match.group(2)
            date_and_time_str = f"{date_str} {hour:02d}:{minute}"
        elif time_match.group(3):
            hour = int(time_match.group(3))
            date_and_time_str = f"{date_str} {hour:02d}:00"

    return date_str, date_and_time_str

def extract_price_advanced(soup, full_text):
    """
    Pontos ármeghatározás. 
    Nem jelöl mindent ingyenesnek! Ha fizetős, visszaadja az árat.
    """
    # 1. JSON-LD keresés
    for json_script in soup.find_all("script", type="application/ld+json"):
        if json_script.string:
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                offers = data.get("offers")
                if offers:
                    if isinstance(offers, list):
                        offers = offers[0]
                    if isinstance(offers, dict):
                        price = offers.get("price") or offers.get("lowPrice")
                        currency = offers.get("priceCurrency", "Ft")
                        if price is not None:
                            if str(price) in ["0", "0.00"]:
                                return "Ingyenes (Free)"
                            return f"{price} {currency}"
            except Exception:
                pass

    # 2. Célzott árszekció keresése
    price_blocks = soup.find_all(text=re.compile(r'jegyár|belépő|árak|árai|jegyek|jegy', re.I))
    for block in price_blocks:
        parent = block.parent.parent if block.parent else None
        if parent:
            block_text = parent.get_text()
            if any(free in block_text.lower() for free in ["ingyenes", "díjmentes", "díjtalan", "ingyen"]):
                return "Ingyenes (Free)"
            price_match = re.search(r'(\d[\d\s\.]*\s*ft(?:\s*-\s*\d[\d\s\.]*\s*ft)?)', block_text, re.I)
            if price_match:
                return price_match.group(1).strip().upper()

    # 3. Szöveg ellenőrzése
    text_lower = full_text.lower()
    
    # Kifejezett ingyenesség
    if any(free in text_lower for free in ["a belépés díjtalan", "belépés ingyenes", "ingyenes rendezvény", "díjmentes belépés"]):
        return "Ingyenes (Free)"

    # Kifejezett Ft összegek
    all_prices = re.findall(r'(\d[\d\s\.]*\s*ft)', text_lower)
    if all_prices:
        valid_prices = [p.upper().strip() for p in all_prices if len(p.strip()) >= 5]
        if valid_prices:
            return valid_prices[0]

    # Ha nem tudjuk bizonyítani, hogy ingyenes, akkor fizetősként kezeljük!
    return "Jegyárak a linken"

def extract_age_requirement(full_text):
    text_lower = full_text.lower()
    if any(kw in text_lower for kw in ["18+", "18 év", "18 éven felül", "18 éven felülieknek"]):
        return "18+"
    elif any(kw in text_lower for kw in ["16+", "16 év", "16 éven felül"]):
        return "16+"
    elif any(kw in text_lower for kw in ["14+", "14 év"]):
        return "14+"
    elif any(kw in text_lower for kw in ["6+", "6 éves kortól"]):
        return "6+"
    return "Korhatár nélkül (All ages)"

def extract_exact_address_and_coords(soup, full_text):
    """
    Pontos utca és házszám kinyerése a kifejezett hibás szavak kiszűrésével.
    """
    for json_script in soup.find_all("script", type="application/ld+json"):
        if json_script.string:
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                loc = data.get("location")
                if isinstance(loc, dict):
                    loc_name = loc.get("name", "")
                    addr = loc.get("address", {})
                    street = addr.get("streetAddress", "") if isinstance(addr, dict) else ""
                    if loc_name and street:
                        full_address = f"{loc_name}, {street}"
                        lat, lon = geocode_address(full_address)
                        return full_address, lat, lon
                    elif street:
                        full_address = f"Székesfehérvár, {street}"
                        lat, lon = geocode_address(full_address)
                        return full_address, lat, lon
            except Exception:
                pass

    # Utcakereső RegEx - kizárjuk a téves szövegrészleteket
    street_match = re.search(r'\b([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű\.\-]+\s+(?:u\.|utca|tér|út|útja|körút|krt\.|körtér|köz)\s*[\d\-\/]*\.?)', full_text)
    if street_match:
        address_found = street_match.group(1).strip()
        address_lower = address_found.lower()
        
        # Szigorú tiltólista a hibás szavakra!
        forbidden_street_words = ["üzleti", "kapcsolódó", "információk", "úton", "útján", "során", "helyes", "irányt"]
        if not any(bad in address_lower for bad in forbidden_street_words):
            if "székesfehérvár" not in address_lower:
                address_found = f"Székesfehérvár, {address_found}"
            lat, lon = geocode_address(address_found)
            return address_found, lat, lon

    full_text_lower = full_text.lower()
    for key, (formatted_name, lat, lon) in KNOWN_VENUES.items():
        if key in full_text_lower:
            return formatted_name, lat, lon

    return "Székesfehérvár", 47.1912, 18.4095

def extract_clean_full_description(soup):
    """
    Letisztított, teljes leírás kinyerése a menüsorok és zajok nélkül.
    """
    # 1. JSON-LD strukturált adat
    for json_script in soup.find_all("script", type="application/ld+json"):
        if json_script.string:
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                if isinstance(data, dict) and "description" in data:
                    desc = data["description"]
                    if isinstance(desc, str) and len(desc) > 50:
                        clean_desc = re.sub(r'\s+', ' ', desc).strip()
                        if not clean_desc.startswith("MAVAN!"):
                            return clean_desc
            except Exception:
                pass

    # 2. Bekezdések összefűzése a fő tartalomterületről
    main_area = soup.find("article") or soup.find("div", class_=re.compile(r'content|detail|entry|show', re.I)) or soup
    paragraphs = main_area.find_all("p")
    valid_texts = []
    for p in paragraphs:
        txt = p.get_text(strip=True)
        if len(txt) > 25 and not txt.startswith("MAVAN!") and "Sütiket használunk" not in txt:
            valid_texts.append(txt)

    if valid_texts:
        full_description = " ".join(valid_texts)
        return re.sub(r'\s+', ' ', full_description).strip()

    # 3. Meta tag fallback
    desc_meta = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
    if desc_meta and desc_meta.get("content"):
        content = desc_meta["content"]
        content = re.sub(r'\.\.\.$', '', content).strip()
        if not content.startswith("MAVAN!"):
            return content

    return "Részletes információkért keresd fel a hivatalos esemény oldalt."

def extract_real_poster_image(soup, page_url):
    """
    Valódi, egyedi plakátképek kiválasztása a sablonképek kiszűrésével.
    """
    forbidden_patterns = [
        "67sigma", "etterem", "restaurant", "hotel", "partner", "szallas", 
        "banner", "logo", "190x190", "com_eventgallery", "bridge?url=", 
        "programturizmus_og.jpg", "szkk_noimage.jpg", "sidelist", 
        "special/sidelist", "593-szekesfehervari-programok", 
        "18380-csaladi-program", "icon", "avatar", "ad-", "advertisement"
    ]

    for json_script in soup.find_all("script", type="application/ld+json"):
        if json_script.string:
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                if isinstance(data, dict) and "image" in data:
                    img_val = data["image"]
                    if isinstance(img_val, list) and len(img_val) > 0:
                        img_val = img_val[0]
                    if isinstance(img_val, dict):
                        img_val = img_val.get("url", "")
                    if isinstance(img_val, str) and img_val.startswith("http"):
                        if not any(bad in img_val.lower() for bad in forbidden_patterns):
                            return img_val
            except Exception:
                pass

    poster_candidates = []
    for img in soup.find_all("img", src=True):
        src = img["src"]
        src_lower = src.lower()

        if any(bad in src_lower for bad in forbidden_patterns):
            continue

        if any(good in src_lower for good in ["/media/image/plakat/", "/media/image/show/", "wp-content/uploads", "poster"]):
            if src.startswith("//"):
                full_src = "https:" + src
            elif src.startswith("/"):
                parsed_base = urllib.parse.urlparse(page_url)
                full_src = f"{parsed_base.scheme}://{parsed_base.netloc}{src}"
            else:
                full_src = src
            poster_candidates.append(full_src)

    if poster_candidates:
        return poster_candidates[0]

    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        content = og_image["content"]
        if not any(bad in content.lower() for bad in forbidden_patterns):
            return content if not content.startswith("//") else "https:" + content

    return "https://fehervariprogram.hu/wordpress/wp-content/uploads/2021/04/szkk_noimage.jpg"

def parse_generic_event_page(url):
    try:
        req = urllib.request.Request(url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        # CRITICAL FIX: Töröljük a navigációt, menüket és fejléceket a tiszta szövegért!
        for noise in soup.find_all(['header', 'nav', 'footer', 'aside', 'noscript']):
            noise.decompose()

        content_area = soup.find("article") or soup.find("div", class_=re.compile(r'content|detail|entry|main', re.I)) or soup
        sub_event_links = []
        for a_tag in content_area.find_all('a', href=True):
            href = a_tag['href']
            if ('/ajanlat-' in href or '/esemeny/' in href or '/event/' in href) and href not in url:
                full_sub_url = f"https://www.programturizmus.hu{href}" if href.startswith('/') else href
                if full_sub_url not in sub_event_links:
                    sub_event_links.append(full_sub_url)

        if len(sub_event_links) >= 3:
            return "HUB_PAGE", sub_event_links

        title_tag = soup.find("h1") or soup.find("meta", property="og:title")
        title_str = title_tag.get_text(strip=True) if hasattr(title_tag, 'get_text') else title_tag.get("content", "")
        
        if not title_str or "biztonsági ellenőrzés" in title_str.lower() or "robot" in title_str.lower():
            return None, []

        title_str = title_str.replace(" - Programturizmus", "").replace(" | SZKKK", "").replace(" - Fehérvári Programok", "").strip()

        desc_str = extract_clean_full_description(soup)
        full_text = soup.get_text()

        price_str = extract_price_advanced(soup, full_text)
        location_str, lat, lon = extract_exact_address_and_coords(soup, full_text)
        header_image = extract_real_poster_image(soup, url)
        date_str, date_and_time_str = parse_date_and_time(desc_str + " " + full_text[:1200])
        age_req_str = extract_age_requirement(full_text)
        categories = extract_categories(title_str, desc_str, full_text)

        # Ha fizetős, a ticket_link megmarad! Ha ingyenes, null/None.
        ticket_link_val = None if price_str == "Ingyenes (Free)" else url

        event_obj = {
            "title": title_str,
            "location": location_str,
            "latitude": lat,
            "longitude": lon,
            "date": date_str,
            "date_and_time": date_and_time_str,
            "description": desc_str,
            "price": price_str,
            "age_requirement": age_req_str,
            "categories": categories,
            "header_image": header_image,
            "ticket_link": ticket_link_val
        }
        return event_obj, []
    except Exception as e:
        print(f"⚠️ Hiba a(z) {url} feldolgozásánál: {e}")
        return None, []

# --- KERESŐFÜGGVÉNYEK ---

def search_programturizmus():
    urls = []
    search_url = "https://www.programturizmus.hu/ajanlat-szekesfehervari-programok.html"
    try:
        req = urllib.request.Request(search_url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if '/ajanlat-' in href and href != search_url:
                full_url = f"https://www.programturizmus.hu{href}" if href.startswith('/') else href
                if full_url not in urls:
                    urls.append(full_url)
    except Exception as e:
        print(f"⚠️ Programturizmus keresési hiba: {e}")
    return urls

def search_fehervariprogram():
    urls = []
    search_url = "https://fehervariprogram.hu/musornaptar/"
    try:
        req = urllib.request.Request(search_url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if 'fehervariprogram.hu/' in href and ('/esemeny/' in href or '/event/' in href or '/202' in href):
                if href not in urls and '/cat_ids' not in href and '/musornaptar' not in href:
                    urls.append(href)
    except Exception as e:
        print(f"⚠️ FehervariProgram keresési hiba: {e}")
    return urls

def search_koncert_hu():
    urls = []
    search_url = "https://www.koncert.hu/helyszin/szekesfehervar"
    try:
        req = urllib.request.Request(search_url, headers=get_headers())
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if '/esemeny/' in href or '/koncert/' in href:
                full_url = f"https://www.koncert.hu{href}" if href.startswith('/') else href
                if full_url not in urls:
                    urls.append(full_url)
    except Exception as e:
        print(f"⚠️ Koncert.hu keresési hiba: {e}")
    return urls

def main():
    active_memory = []
    known_urls = set()

    urls_to_process = set()
    urls_to_process.update(search_programturizmus())
    urls_to_process.update(search_fehervariprogram())
    urls_to_process.update(search_koncert_hu())

    print(f"🌐 Összesen {len(urls_to_process)} esemény linkje felfedezve.")

    while urls_to_process:
        url = urls_to_process.pop()
        if url in known_urls:
            continue
        known_urls.add(url)

        res, sub_links = parse_generic_event_page(url)

        if res == "HUB_PAGE":
            for sub_url in sub_links:
                if sub_url not in known_urls:
                    urls_to_process.add(sub_url)
        elif res is not None:
            active_memory.append(res)
            print(f"✨ Elmentve: {res['title']} | Ár: {res['price']} | Cím: {res['location']}")

    if len(active_memory) > 0:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(active_memory, f, ensure_ascii=False, indent=2)
        print(f"💾 Memória frissítve! Összesen {len(active_memory)} tisztított esemény elmentve.")
    else:
        print("⚠️ Egyetlen eseményt sem sikerült kinyerni. Az events.json nem lett felülírva.")

if __name__ == "__main__":
    main()
