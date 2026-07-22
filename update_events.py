import json
import urllib.request
import urllib.parse
import re
from datetime import datetime
from bs4 import BeautifulSoup

MEMORY_FILE = "events.json"

# Search terms for electronic/techno music
SEARCH_KEYWORDS = ["techno", "underground", "electronic"]

def load_memory():
    """Loads existing event data from events.json."""
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def purge_expired_events(events):
    """Deletes events whose start date has passed."""
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
    """Extracts direct image link from OpenGraph or HTML img tags."""
    # 1. OpenGraph image (og:image)
    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        img_url = og_image["content"]
        if img_url.startswith("//"):
            return "https:" + img_url
        return img_url
        
    # 2. Twitter image card
    twitter_image = soup.find("meta", attrs={"name": "twitter:image"})
    if twitter_image and twitter_image.get("content"):
        return twitter_image["content"]
        
    # 3. First prominent image in article tag
    article = soup.find("article") or soup
    img = article.find("img", src=True)
    if img:
        src = img["src"]
        if src.startswith("/"):
            parsed_base = urllib.parse.urlparse(page_url)
            return f"{parsed_base.scheme}://{parsed_base.netloc}{src}"
        return src

    return ""

def parse_generic_event_page(url, is_free_town_event=False):
    """Parses metadata (JSON-LD / OpenGraph) from event pages."""
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        # Title
        title_meta = soup.find("meta", property="og:title")
        title_str = title_meta["content"] if title_meta else "Local Town Event"
        
        # Direct Image Link
        header_image = extract_direct_image(soup, url)
        
        # Description
        desc_meta = soup.find("meta", property="og:description")
        desc_str = desc_meta["content"] if desc_meta else "Town event and cultural gathering."
        
        # Price tag
        price = "Ingyenes (Free)" if is_free_town_event else "Jegyárak az oldalon"

        # Defaults
        start_date = datetime.now().strftime("%Y-%m-%d")
        location_name = "Székesfehérvár"
        lat, lon = 47.1912, 18.4095  # Székesfehérvár coordinates
        
        # Parse JSON-LD Structured Data
        for json_script in soup.find_all("script", type="application/ld+json"):
            if not json_script.string:
                continue
            try:
                data = json.loads(json_script.string)
                if isinstance(data, list):
                    data = data[0]
                
                if data.get("@type") == "Event" or "startDate" in data:
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
            "price": price,
            "header_image": header_image,
            "ticket_link": url
        }
    except Exception as e:
        print(f"⚠️ Could not parse {url}: {e}")
        return None

# --- SCRAPER FUNCTIONS ---

def search_cooltix(keyword):
    """Searches Cooltix.hu for event links."""
    urls = []
    encoded_query = urllib.parse.quote(keyword)
    search_url = f"https://cooltix.hu/search?q={encoded_query}"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        req = urllib.request.Request(search_url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if '/event/' in href or '/b/' in href:
                full_url = f"https://cooltix.hu{href}" if href.startswith('/') else href
                if full_url not in urls:
                    urls.append(full_url)
    except Exception as e:
        print(f"⚠️ Cooltix search failed: {e}")
    return urls

def search_tixa(keyword):
    """Searches Tixa.hu for event links."""
    urls = []
    encoded_query = urllib.parse.quote(keyword)
    search_url = f"https://www.tixa.hu/kereses?q={encoded_query}"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        req = urllib.request.Request(search_url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if ('/event/' in href or 'tixa.hu/' in href) and href != search_url:
                full_url = f"https://www.tixa.hu{href}" if href.startswith('/') else href
                if full_url not in urls and 'kereses' not in full_url:
                    urls.append(full_url)
    except Exception as e:
        print(f"⚠️ Tixa search failed: {e}")
    return urls

def search_programturizmus(location="szekesfehervar"):
    """Scrapes free municipal events from Programturizmus.hu."""
    urls = []
    search_url = f"https://www.programturizmus.hu/helykategoria-szabadido.{location}.html"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        req = urllib.request.Request(search_url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if '/ajanlat-' in href or '/partner-' in href:
                full_url = f"https://www.programturizmus.hu{href}" if href.startswith('/') else href
                if full_url not in urls:
                    urls.append(full_url)
    except Exception as e:
        print(f"⚠️ Programturizmus search failed: {e}")
    return urls

def search_fehervari_programok():
    """Scrapes official town events from fehervariprogram.hu."""
    urls = []
    search_url = "https://fehervariprogram.hu/musornaptar/"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        req = urllib.request.Request(search_url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if 'fehervariprogram.hu/' in href and href != search_url and '/category/' not in href:
                if href not in urls:
                    urls.append(href)
    except Exception as e:
        print(f"⚠️ FehervariProgram search failed: {e}")
    return urls

# --- MAIN EXECUTION ---

def main():
    # 1. Read existing memory
    memory = load_memory()
    print(f"📖 Loaded {len(memory)} events from memory.")

    # 2. Date Check: Purge past events
    active_memory = purge_expired_events(memory)
    known_urls = {e["ticket_link"] for e in active_memory if "ticket_link" in e}
    print(f"✅ Active future events retained: {len(active_memory)}")

    # 3. Discover links from ticketing & town portals
    discovered_urls = set()
    
    # Ticketing sites
    for kw in SEARCH_KEYWORDS:
        discovered_urls.update(search_cooltix(kw))
        discovered_urls.update(search_tixa(kw))

    # Free town portals
    town_urls = set()
    town_urls.update(search_programturizmus("szekesfehervar"))
    town_urls.update(search_fehervari_programok())

    # 4. Process new paid events
    added_count = 0
    for url in list(discovered_urls)[:10]:
        if url not in known_urls:
            event_data = parse_generic_event_page(url, is_free_town_event=False)
            if event_data and event_data["header_image"]:
                active_memory.append(event_data)
                known_urls.add(url)
                added_count += 1
                print(f"✨ New event added: {event_data['title']} ({event_data['date']})")

    # 5. Process new free town events
    for url in list(town_urls)[:10]:
        if url not in known_urls:
            event_data = parse_generic_event_page(url, is_free_town_event=True)
            if event_data and event_data["header_image"]:
                active_memory.append(event_data)
                known_urls.add(url)
                added_count += 1
                print(f"🏛️ New free town event added: {event_data['title']} ({event_data['date']})")

    # 6. Overwrite events.json with clean data
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(active_memory, f, ensure_ascii=False, indent=2)

    print(f"💾 Memory updated! Saved {len(active_memory)} upcoming events to events.json (+{added_count} new).")

if __name__ == "__main__":
    main()
