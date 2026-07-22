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
    "feketehegy": ("Feketehegy-Szárazréti Közösségi Ház, Székesfehérvár", 47.2065, 18.3750)
}

def load_memory():
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

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
        print(f"⚠️ Geocoding failed for '{address}': {e}")

    return 47.1912, 18.4095

def parse_date_and_time(text):
    if not text:
        date_str = datetime.now().strftime("%Y-%m-%d")
        return date_str, None
    
    date_str = None
    
    # 1. Dátum felismerés
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

    # 2. Időpont felismerés (A dátum karaktereket előbb kimaszkoljuk, hogy a 07-24-ből ne legyen 07:24!)
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

    price_blocks = soup.find_all(text=re.compile(r'jegyár|belépő|árak|árai|jegyek', re.I))
    for block in price_blocks:
        parent = block.parent.parent if block.parent else None
        if parent:
            block_text = parent.get_text()
            if any(free in block_text.lower() for free in ["ingyenes", "díjmentes", "díjtalan"]):
                return "Ingyenes (Free)"
            price_match = re.search(r'(\d[\d\s\.]*\s*ft(?:\s*-\s*\d[\d\s\.]*\s*ft)?)', block_text, re.I)
            if price_match:
                return price_match.group(1).strip().upper()

    text_lower = full_text.lower()
    if any(free in text_lower for free in ["a belépés díjtalan", "belépés ingyenes", "ingyenes rendezvény"]):
        return "Ingyenes (Free)"

    all_prices = re.findall(r'(\d[\d\s\.]*\s*ft)', text_lower)
    if all_prices:
        valid_prices = [p.upper().strip() for p in all_prices if len(p.strip()) >= 5]
        if valid_prices:
            return valid_prices[0]

    return "Részletek a linken"

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

    street_match = re.search(r'(Székesfehérvár[,\s]+[A-ZÁÉÍÓÖŐÚÜŰa-záéíóöőúüű0-9\s\.\-]+\b(?:u\.|utca|tér|út|krt\.|körtér)\s*[\d\-\/]*\.?)', full_text)
    if street_match:
        address_found = street_match.group(1).strip()
        lat, lon = geocode_address(address_found)
        return address_found, lat, lon

    full_text_lower = full_text.lower()
    for key, (formatted_name, lat, lon) in KNOWN_VENUES.items():
        if key in full_text_lower:
            return formatted_name, lat, lon

    return "Székesfehérvár", 47.1912, 18.4095

def extract_real_poster_image(soup, page_url):
    forbidden = [
        "67sigma", "etterem", "restaurant", "hotel", "partner", "szallas", 
        "banner", "logo", "190x190", "com_eventgallery", "bridge?url=", 
        "programturizmus_og.jpg", "szkk_noimage.jpg"
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
                        if not any(bad in img_val.lower() for bad in forbidden):
                            return img_val
            except Exception:
                pass

    poster_candidates = []
    for img in soup.find_all("img", src=True):
        src = img["src"]
        src_lower = src.lower()

        if any(bad in src_lower for bad in forbidden):
            continue

        if any(good in src_lower for good in ["/media/image/plakat/", "/media/image/show/", "/media/image/special/"]):
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
        if not any(bad in content.lower() for bad in forbidden):
            return content if not content.startswith("//") else "https:" + content

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
        
        # Csalit/Gyűjtőoldal ellenőrzés:
        # Ha a cikk belsejében 2-nél több más '/ajanlat-' link található, akkor ez egy GYŰJTŐOLDAL.
        content_area = soup.find("article") or soup.find("div", class_=re.compile(r'content|detail|entry|main', re.I)) or soup
        sub_event_links = []
        for a_tag in content_area.find_all('a', href=True):
            href = a_tag['href']
            if '/ajanlat-' in href and href not in url:
                full_sub_url = f"https://www.programturizmus.hu{href}" if href.startswith('/') else href
                if full_sub_url not in sub_event_links:
                    sub_event_links.append(full_sub_url)

        # Ha gyűjtőoldalt találtunk, elmentjük az al-linkeket, de maga az összefoglaló oldal NEM kerül be!
        if len(sub_event_links) >= 2:
            print(f"📂 Hub/Gyűjtőoldal detektálva ({url}): {len(sub_event_links)} al-esemény kinyerve.")
            return "HUB_PAGE", sub_event_links

        title_tag = soup.find("h1") or soup.find("meta", property="og:title")
        title_str = title_tag.get_text(strip=True) if hasattr(title_tag, 'get_text') else title_tag.get("content", "")
        
        if "biztonsági ellenőrzés" in title_str.lower() or "robot" in title_str.lower():
            return None, []

        title_str = title_str.replace(" - Programturizmus", "").replace(" | SZKKK", "").strip()

        desc_meta = soup.find("meta", property="og:description")
        desc_str = desc_meta["content"] if desc_meta else soup.get_text()[:300]
        desc_str = re.sub(r'\s+', ' ', desc_str).strip()

        full_text = soup.get_text()

        price_str = extract_price_advanced(soup, full_text)
        location_str, lat, lon = extract_exact_address_and_coords(soup, full_text)
        header_image = extract_real_poster_image(soup, url)
        date_str, date_and_time_str = parse_date_and_time(desc_str + " " + full_text[:1200])
        age_req_str = extract_age_requirement(full_text)

        event_obj = {
            "title": title_str,
            "location": location_str,
            "latitude": lat,
            "longitude": lon,
            "date": date_str,
            "date_and_time": date_and_time_str,
            "description": desc_str[:250] + "...",
            "price": price_str,
            "age_requirement": age_req_str,
            "header_image": header_image,
            "ticket_link": url
        }
        return event_obj, []
    except Exception as e:
        print(f"⚠️ Could not parse {url}: {e}")
        return None, []

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

def main():
    active_memory = []
    known_urls = set()

    # Keresési lista összeállítása
    urls_to_process = set(search_programturizmus())

    while urls_to_process:
        url = urls_to_process.pop()
        if url in known_urls:
            continue
        known_urls.add(url)

        res, sub_links = parse_generic_event_page(url)

        # Ha gyűjtőoldalt találtunk, hozzáadjuk az al-linkjeit a feldolgozandó sorhoz!
        if res == "HUB_PAGE":
            for sub_url in sub_links:
                if sub_url not in known_urls:
                    urls_to_process.add(sub_url)
        elif res is not None:
            active_memory.append(res)
            print(f"✨ Egyedi esemény elmentve: {res['title']} | Cím: {res['location']} | Idő: {res['date_and_time']}")

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(active_memory, f, ensure_ascii=False, indent=2)

    print(f"💾 Memória frissítve! Összesen {len(active_memory)} konkrét esemény elmentve.")

if __name__ == "__main__":
    main()
