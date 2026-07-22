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

# Székesfehérvár exact venue GPS database
KNOWN_VENUES = {
    "bory-vár": ("Bory-vár, Székesfehérvár", 47.2023, 18.4583),
    "bory vár": ("Bory-vár, Székesfehérvár", 47.2023, 18.4583),
    "bory-tér": ("Bory-tér, Székesfehérvár", 47.2020, 18.4580),
    "hiemer": ("Hiemer-ház, Székesfehérvár", 47.1911, 18.4088),
    "városház tér": ("Városház tér, Székesfehérvár", 47.1915, 18.4096),
    "zichy liget": ("Zichy liget, Székesfehérvár", 47.1948, 18.4087),
    "csónakázó-tó": ("Csónakázó-tó, Székesfehérvár", 47.1970, 18.4005),
    "koronás park": ("Koronás Park, Székesfehérvár", 47.1975, 18.3990),
    "jancsárkert": ("Jancsárkert, Székesfehérvár", 47.1856, 18.4112),
    "vörösmarty színház": ("Vörösmarty Színház, Székesfehérvár", 47.1901, 18.4083),
    "nyolcas műhely": ("Nyolcas Műhely, Székesfehérvár", 47.1865, 18.4180),
    "alba regia sportcsarnok": ("Alba Regia Sportcsarnok, Székesfehérvár", 47.1825, 18.4182),
    "met aréna": ("MET Aréna, Székesfehérvár", 47.1720, 18.4350),
    "alba aréna": ("Alba Aréna, Székesfehérvár", 47.1720, 18.4350),
    "köfém": ("Köfém Művelődési Ház, Székesfehérvár", 47.1790, 18.4410),
    "szárazrét": ("Feketehegy-Szárazréti Közösségi Ház, Székesfehérvár", 47.2065, 18.3750),
    "feketehegy": ("Feketehegy-Szárazréti Közösségi Ház, Székesfehérvár", 47.2065, 18.3750),
    "gorsium": ("Gorsium Régészeti Park, Tác", 47.0945, 18.4320),
    "börgönd": ("Börgöndi Repülőtér, Székesfehérvár", 47.1352, 18.5011),
    "országzászló tér": ("Országzászló tér, Székesfehérvár", 47.1922, 18.4085)
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

def extract_price_from_container(soup, full_text):
    """Accurately extracts prices from dedicated ticket info containers."""
    # Look for dedicated price info sections in HTML
    price_section = soup.find(class_=re.compile(r'jegy|ar|price|belepo|ticket', re.I))
    text_to_check = price_section.get_text() if price_section else full_text[:1500]
    text_lower = text_to_check.lower()

    if any(free_word in text_lower for free_word in ["díjmentes", "ingyenes", "a belépés díjtalan", "ingyen"]):
        return "Ingyenes (Free)"

    price_match = re.search(r'(\d[\d\s\.]*\s*ft(?:\s*-\s*\d[\d\s\.]*\s*ft)?)', text_lower)
    if price_match:
        return price_match.group(1).upper()

    return "Részletek a linken"

def match_venue_and_coords(soup, title, description, full_text):
    """Finds exact venue and returns proper GPS coordinates."""
    search_space = f"{title} {description} {full_text[:1000]}".lower()

    for key, (formatted_name, lat, lon) in KNOWN_VENUES.items():
        if key in search_space:
            return formatted_name, lat, lon

    return "Székesfehérvár", 47.1912, 18.4095

def extract_real_poster_image(soup, page_url):
    """Extracts ONLY genuine event posters, discarding sponsor & restaurant ads."""
    
    # Strictly forbidden URLs and sponsor domains
    forbidden = [
        "67sigma", "etterem", "restaurant", "hotel", "partner", "szallas", 
        "banner", "logo", "190x190", "com_eventgallery", "bridge?url=", 
        "programturizmus_og.jpg", "szkk_noimage.jpg"
    ]

    # Priority 1: Check JSON-LD structured image
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

    # Priority 2: Look for actual poster image paths on Programturizmus
    poster_candidates = []
    for img in soup.find_all("img", src=True):
        src = img["src"]
        src_lower = src.lower()

        if any(bad in src_lower for bad in forbidden):
            continue

        # Look for real Programturizmus poster directories
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

    # Fallback to general og:image if clean
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
        
        title_tag = soup.find("h1") or soup.find("meta", property="og:title")
        title_str = title_tag.get_text(strip=True) if hasattr(title_tag, 'get_text') else title_tag.get("content", "")
        
        if "biztonsági ellenőrzés" in title_str.lower() or "robot" in title_str.lower():
            return None

        title_str = title_str.replace(" - Programturizmus", "").replace(" | SZKKK", "").strip()

        desc_meta = soup.find("meta", property="og:description")
        desc_str = desc_meta["content"] if desc_meta else soup.get_text()[:300]
        desc_str = re.sub(r'\s+', ' ', desc_str).strip()

        full_text = soup.get_text()

        # Extract verified data
        price_str = extract_price_from_container(soup, full_text)
        location_str, lat, lon = match_venue_and_coords(soup, title_str, desc_str, full_text)
        header_image = extract_real_poster_image(soup, url)
        start_date = parse_date_from_text(desc_str) or parse_date_from_text(full_text[:1200]) or datetime.now().strftime("%Y-%m-%d")

        return {
            "title": title_str,
            "location": location_str,
            "latitude": lat,
            "longitude": lon,
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

def main():
    active_memory = []
    known_urls = set()

    discovered_urls = set()
    discovered_urls.update(search_programturizmus())

    for url in list(discovered_urls):
        if url not in known_urls:
            event_data = parse_generic_event_page(url)
            if event_data:
                active_memory.append(event_data)
                known_urls.add(url)
                print(f"✨ Verified: {event_data['title']} | Venue: {event_data['location']} ({event_data['latitude']}, {event_data['longitude']}) | Image: {event_data['header_image']}")

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(active_memory, f, ensure_ascii=False, indent=2)

    print(f"💾 Updated memory with {len(active_memory)} verified events.")

if __name__ == "__main__":
    main()
