import json
import urllib.request
import urllib.parse
import re
from datetime import datetime
from bs4 import BeautifulSoup

MEMORY_FILE = "events.json"

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

def extract_direct_image(soup, page_url):
    """Kiemeli a valódi egyedi eseményképet, kiszűrve a gyűjtőoldalak általános logóit."""
    
    # Kiszűrendő általános logók listája
    generic_logos = ["programturizmus_og.jpg", "szkk_noimage.jpg", "default", "logo"]

    # 1. Próbáljuk meg megtalálni a cikk törzsében található legelső nagy képet
    content_area = soup.find("article") or soup.find("div", class_=re.compile("content|detail|entry|post")) or soup
    for img in content_area.find_all("img", src=True):
        src = img["src"]
        if not any(bad in src.lower() for bad in generic_logos) and ("upload" in src or "images" in src or "media" in src or "wp-content" in src):
            if src.startswith("//"):
                return "https:" + src
            elif src.startswith("/"):
                parsed_base = urllib.parse.urlparse(page_url)
                return f"{parsed_base.scheme}://{parsed_base.netloc}{src}"
            return src

    # 2. Ha nincs kép a cikkben, megnézzük az og:image-et (de csak ha nem az általános logó)
    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        img_url = og_image["content"]
        if not any(bad in img_url.lower() for bad in generic_logos):
            if img_url.startswith("//"):
                return "https:" + img_url
            return img_url

    return "https://fehervariprogram.hu/wordpress/wp-content/uploads/2021/04/szkk_noimage.jpg"

def parse_generic_event_page(url, default_title="Székesfehérvári Program"):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        # Cím letisztítása
        title_meta = soup.find("meta", property="og:title")
        title_str = title_meta["content"] if title_meta else default_title
        title_str = title_str.replace(" - Programturizmus", "").strip()
        
        # Egyedi borítókép kinyerése
        header_image = extract_direct_image(soup, url)
        
        # Leírás
        desc_meta = soup.find("meta", property="og:description")
        desc_str = desc_meta["content"] if desc_meta else "Helyi esemény Székesfehérváron."
        
        start_date = datetime.now().strftime("%Y-%m-%d")
        location_name = "Székesfehérvár"
        lat, lon = 47.1912, 18.4095
        
        # JSON-LD adatok beolvasása a pontos dátumokért
        for json_script in soup.find_all("script", type="application/ld+json"):
            if not json_script.string:
                continue
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                
                if data.get("@type") in ["Event", "MusicEvent", "ExhibitionEvent", "SportsEvent"] or "startDate" in data:
                    raw_date = data.get("startDate")
                    if raw_date:
                        start_date = raw_date.split("T")[0]
                        
                    loc_info = data.get("location", {})
                    if isinstance(loc_info, dict):
                        location_name = loc_info.get("name", location_name)
                        geo = loc_info.get("geo", {})
                        if isinstance(geo, dict):
                            lat = float(geo.get("latitude", lat))
                            lon = float(geo.get("longitude", lon))
                    break
            except Exception:
                continue

        return {
            "title": title_str,
            "location": location_name,
            "latitude": lat,
            "longitude": lon,
            "date": start_date,
            "description": desc_str,
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
    memory = load_memory()
    print(f"📖 Loaded {len(memory)} events from memory.")

    active_memory = purge_expired_events(memory)
    known_urls = {e["ticket_link"] for e in active_memory if "ticket_link" in e}

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
                print(f"✨ Event added with unique image: {event_data['title']}")

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(active_memory, f, ensure_ascii=False, indent=2)

    print(f"💾 Memory updated! Total events in database: {len(active_memory)} (+{added_count} new).")

if __name__ == "__main__":
    main()
