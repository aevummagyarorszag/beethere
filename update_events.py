"""Események frissítése a GitHub Pages-hez használt events.json fájlba.

Kiemelt védelem:
* a poszter kiválasztása több jelölt pontozásával történik, így a reklámok és
  logók nem előzik meg a tartalmi képet;
* a gyűjtőoldalakon a JSON-LD Event elemeket közvetlenül feldolgozza, vagy
  csak az ismétlődő eseménykártyák konkrét linkjeit követi;
* egyedi eseményoldalon nem követi tévesen a „kapcsolódó programok” linkjeit.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable

from bs4 import BeautifulSoup, Tag


MEMORY_FILE = "events.json"
MAX_EVENTS = 35
MAX_QUEUE_SIZE = 100
REQUEST_TIMEOUT_SECONDS = 12
DEFAULT_COORDS = (47.1912, 18.4095)
SEARCH_URL = "https://www.programturizmus.hu/ajanlat-szekesfehervari-programok.html"

MONTHS_HU = {
    "január": "01", "januar": "01", "jan": "01", "február": "02",
    "februar": "02", "feb": "02", "március": "03", "marcius": "03",
    "mar": "03", "április": "04", "aprilis": "04", "apr": "04",
    "május": "05", "majus": "05", "maj": "05", "június": "06",
    "junius": "06", "jun": "06", "július": "07", "julius": "07",
    "jul": "07", "augusztus": "08", "aug": "08", "szeptember": "09",
    "szep": "09", "sept": "09", "október": "10", "oktober": "10",
    "okt": "10", "november": "11", "nov": "11", "december": "12",
    "dec": "12",
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
    "alba regia sportcsarnok": ("Alba Regia Sportcsarnok", 47.1825, 18.4182),
    "met aréna": ("MET Aréna, Székesfehérvár", 47.1720, 18.4350),
    "köfém": ("Köfém Művelődési Ház, Székesfehérvár", 47.1790, 18.4410),
    "gorsium": ("Gorsium Régészeti Park, Tác", 47.0945, 18.4320),
}

# Ezek a szavak reklámot, navigációt, cégprofilt vagy helyőrzőt jeleznek.
IMAGE_REJECT_TOKENS = {
    "advert", "banner", "partner", "sponsor", "szponzor", "logo", "icon",
    "avatar", "cookie", "tracking", "analytics", "hotel", "restaurant", "etterem",
    "szallas", "bridge?url=", "noimage", "placeholder", "sidelist", "sidebar",
    "programturizmus_og", "facebook", "instagram", "youtube",
}
IMAGE_POSTER_TOKENS = {
    "plakat", "poster", "event", "esemeny", "program", "rendezveny", "gallery",
    "uploads", "media", "show", "cover", "hero", "featured",
}
HUB_TITLE_TOKENS = {"programok", "események", "esemenyek", "naptár", "naptar", "ajánlatok", "ajanlatok"}
GEO_CACHE: dict[str, tuple[float, float]] = {}


@dataclass(frozen=True)
class ImageCandidate:
    url: str
    score: int


def request_headers() -> dict[str, str]:
    return {
        "User-Agent": "BeeThereEventUpdater/2.0 (+https://github.com/)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.7",
    }


def fetch_html(url: str) -> str | None:
    """Letölti az oldalt egyszeri, rövid újrapróbálással."""
    for attempt in range(2):
        try:
            request = urllib.request.Request(url, headers=request_headers())
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                raw = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, errors="replace")
        except Exception as error:
            if attempt == 1:
                print(f"  ! Nem tölthető le: {url} ({error})")
            time.sleep(1 + attempt)
    return None


def canonical_url(url: str, base_url: str) -> str:
    joined = urllib.parse.urljoin(base_url, html.unescape(url.strip()))
    parsed = urllib.parse.urlsplit(joined)
    if parsed.scheme not in {"http", "https"}:
        return ""
    # A követőkódok miatt azonos esemény ne kerüljön kétszer a sorba.
    kept_query = urllib.parse.urlencode(
        [(key, value) for key, value in urllib.parse.parse_qsl(parsed.query) if not key.lower().startswith("utm_")]
    )
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, kept_query, ""))


def text_of(node: Tag | None) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True) if node else "").strip()


def flatten_jsonld(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, list):
        for item in value:
            yield from flatten_jsonld(item)
    elif isinstance(value, dict):
        yield value
        if isinstance(value.get("@graph"), list):
            yield from flatten_jsonld(value["@graph"])


def jsonld_items(soup: BeautifulSoup) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for script in soup.select('script[type="application/ld+json"]'):
        if not script.string:
            continue
        try:
            items.extend(flatten_jsonld(json.loads(script.string)))
        except (TypeError, json.JSONDecodeError):
            continue
    return items


def is_event(item: dict[str, Any]) -> bool:
    kind = item.get("@type", "")
    kinds = kind if isinstance(kind, list) else [kind]
    return any(str(value).lower() in {"event", "musicevent", "theaterevent", "sportsEvent".lower()} for value in kinds)


def image_urls(value: Any, base_url: str) -> list[str]:
    if isinstance(value, str):
        return [canonical_url(value, base_url)]
    if isinstance(value, dict):
        return image_urls(value.get("url") or value.get("contentUrl"), base_url)
    if isinstance(value, list):
        return [url for entry in value for url in image_urls(entry, base_url)]
    return []


def image_is_rejected(url: str, context: str = "") -> bool:
    probe = f"{url} {context}".lower()
    return not url or any(token in probe for token in IMAGE_REJECT_TOKENS)


def score_image(url: str, context: str, source_score: int, title_words: set[str], in_content: bool) -> int:
    probe = f"{url} {context}".lower()
    if image_is_rejected(url, context):
        return -10_000
    score = source_score + (18 if in_content else 0)
    score += sum(7 for token in IMAGE_POSTER_TOKENS if token in probe)
    score += 9 * len(title_words.intersection(set(re.findall(r"[\wáéíóöőúüű]{4,}", probe))))
    if re.search(r"(?:^|[-_/])(?:1\d\d|2\d\d)x(?:1\d\d|2\d\d)(?:[-_.]|$)", probe):
        score -= 80
    return score


def nearest_image_context(image: Tag) -> tuple[str, bool]:
    context_nodes: list[str] = []
    in_content = False
    parent: Tag | None = image.parent if isinstance(image.parent, Tag) else None
    for _ in range(5):
        if not parent:
            break
        classes = " ".join(parent.get("class", []))
        identifier = f"{parent.name} {parent.get('id', '')} {classes}".lower()
        context_nodes.append(identifier)
        if parent.name in {"article", "main"} or any(word in identifier for word in ("event", "program", "content", "detail", "entry", "card")):
            in_content = True
        parent = parent.parent if isinstance(parent.parent, Tag) else None
    return " ".join(context_nodes), in_content


def extract_best_image(soup: BeautifulSoup, page_url: str, title: str, event_data: dict[str, Any] | None = None) -> str | None:
    """A több forrásból gyűjtött képek közül a legjobb posztert adja vissza."""
    candidates: list[ImageCandidate] = []
    title_words = set(re.findall(r"[\wáéíóöőúüű]{4,}", title.lower()))

    # Egy konkrét Event JSON-LD-je a legerősebb jel; sok oldal itt adja meg a posztert.
    for item in ([event_data] if event_data else []) + jsonld_items(soup):
        if not isinstance(item, dict) or (not event_data and not is_event(item)):
            continue
        for url in image_urls(item.get("image"), page_url):
            candidates.append(ImageCandidate(url, score_image(url, "jsonld event", 100, title_words, True)))

    for selector, base_score in (("meta[property='og:image']", 62), ("meta[name='twitter:image']", 56)):
        tag = soup.select_one(selector)
        if tag and tag.get("content"):
            url = canonical_url(str(tag["content"]), page_url)
            candidates.append(ImageCandidate(url, score_image(url, selector, base_score, title_words, False)))

    for image in soup.find_all("img"):
        context, in_content = nearest_image_context(image)
        width = str(image.get("width", ""))
        height = str(image.get("height", ""))
        if width.isdigit() and int(width) < 260 or height.isdigit() and int(height) < 180:
            continue
        raw_sources = [image.get("data-src"), image.get("data-lazy-src"), image.get("src")]
        if image.get("srcset"):
            raw_sources.extend(part.strip().split(" ")[0] for part in str(image["srcset"]).split(","))
        for raw_url in filter(None, raw_sources):
            url = canonical_url(str(raw_url), page_url)
            context_with_alt = f"{context} {image.get('alt', '')} {image.get('title', '')}"
            candidates.append(ImageCandidate(url, score_image(url, context_with_alt, 35, title_words, in_content)))

    best_by_url: dict[str, int] = {}
    for candidate in candidates:
        if candidate.score > best_by_url.get(candidate.url, -10_001):
            best_by_url[candidate.url] = candidate.score
    suitable = [ImageCandidate(url, score) for url, score in best_by_url.items() if score > 45]
    return max(suitable, key=lambda candidate: candidate.score).url if suitable else None


def parse_date_and_time(text: str) -> tuple[str | None, str | None]:
    text = re.sub(r"\s+", " ", text or " ")
    iso_match = re.search(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?", text)
    dot_match = re.search(r"\b(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?", text)
    hu_match = re.search(r"\b(20\d{2})\.?(?:\s+)([a-záéíóöőúüű]+)\s+(\d{1,2})\.?", text.lower())
    date_str: str | None = None
    time_str: str | None = None
    if iso_match:
        year, month, day, hour, minute = iso_match.groups()
        date_str = f"{year}-{int(month):02d}-{int(day):02d}"
        if hour:
            time_str = f"{int(hour):02d}:{minute}"
    elif dot_match:
        year, month, day = dot_match.groups()
        date_str = f"{year}-{int(month):02d}-{int(day):02d}"
    elif hu_match:
        year, month_name, day = hu_match.groups()
        month = MONTHS_HU.get(month_name.rstrip("."))
        if month:
            date_str = f"{year}-{month}-{int(day):02d}"
    if not time_str:
        time_match = re.search(r"\b([01]?\d|2[0-3])[:.]([0-5]\d)\b|\b([01]?\d|2[0-3])\s*órakor?\b", text, re.I)
        if time_match:
            time_str = f"{int(time_match.group(1) or time_match.group(3)):02d}:{time_match.group(2) or '00'}"
    return date_str, f"{date_str} {time_str}" if date_str and time_str else None


def geocode_address(address: str) -> tuple[float, float]:
    if not address:
        return DEFAULT_COORDS
    if address in GEO_CACHE:
        return GEO_CACHE[address]
    try:
        query = urllib.parse.urlencode({"q": address, "format": "json", "limit": 1})
        request = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/search?{query}",
            headers={"User-Agent": "BeeThereEventUpdater/2.0 (GitHub Pages event index)"},
        )
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            result = json.loads(response.read().decode("utf-8"))
        if result:
            GEO_CACHE[address] = (float(result[0]["lat"]), float(result[0]["lon"]))
            time.sleep(1.1)  # Nominatim használati szabály: legfeljebb 1 kérés/mp.
            return GEO_CACHE[address]
    except Exception:
        pass
    GEO_CACHE[address] = DEFAULT_COORDS
    return DEFAULT_COORDS


def extract_location(soup: BeautifulSoup, full_text: str, event_data: dict[str, Any] | None = None) -> tuple[str, float, float]:
    for item in ([event_data] if event_data else []) + jsonld_items(soup):
        if not isinstance(item, dict):
            continue
        location = item.get("location")
        locations = location if isinstance(location, list) else [location]
        for value in locations:
            if not isinstance(value, dict):
                continue
            name = str(value.get("name", "")).strip()
            address = value.get("address")
            address_text = ", ".join(str(address.get(key, "")).strip() for key in ("streetAddress", "postalCode", "addressLocality") if isinstance(address, dict) and address.get(key))
            formatted = ", ".join(part for part in (name, address_text) if part) or name
            geo = value.get("geo", {})
            if formatted and isinstance(geo, dict) and geo.get("latitude") and geo.get("longitude"):
                return formatted, float(geo["latitude"]), float(geo["longitude"])
            if formatted:
                return formatted, *geocode_address(formatted)
    lowered = full_text.lower()
    for key, venue in KNOWN_VENUES.items():
        if key in lowered:
            return venue
    return "Székesfehérvár", *DEFAULT_COORDS


def extract_price(soup: BeautifulSoup, full_text: str, event_data: dict[str, Any] | None = None) -> str:
    if event_data:
        offers = event_data.get("offers")
        offers = offers[0] if isinstance(offers, list) and offers else offers
        if isinstance(offers, dict) and offers.get("price") is not None:
            price = str(offers["price"])
            return "Ingyenes" if price in {"0", "0.0", "0.00"} else f"{price} {offers.get('priceCurrency', 'Ft')}"
    lowered = full_text.lower()
    if any(term in lowered for term in ("belépés ingyenes", "belépés díjtalan", "ingyenes rendezvény")):
        return "Ingyenes"
    price_match = re.search(r"\b(\d[\d .]*\s*(?:ft|forint))\b", full_text, re.I)
    return price_match.group(1).replace("forint", "Ft").strip() if price_match else "Jegyár a linken"


def extract_description(soup: BeautifulSoup, event_data: dict[str, Any] | None = None) -> str:
    if event_data and isinstance(event_data.get("description"), str):
        description = BeautifulSoup(event_data["description"], "html.parser").get_text(" ", strip=True)
        if len(description) > 35:
            return description
    main = soup.find("article") or soup.find("main") or soup.find("div", class_=re.compile(r"content|detail|entry", re.I)) or soup
    paragraphs = [text_of(paragraph) for paragraph in main.find_all("p")]
    paragraphs = [paragraph for paragraph in paragraphs if len(paragraph) > 35 and "süti" not in paragraph.lower()]
    if paragraphs:
        return " ".join(paragraphs[:4])
    meta = soup.select_one("meta[property='og:description'], meta[name='description']")
    return str(meta.get("content", "Részletek a hivatalos eseményoldalon.")).strip() if meta else "Részletek a hivatalos eseményoldalon."


def categories(title: str, description: str) -> list[str]:
    text = f"{title} {description}".lower()
    mapping = {
        "zene": ("koncert", "zenekar", "dj", "party", "buli", "zene"),
        "kultúra": ("színház", "előadás", "kiállítás", "könyv", "stand-up", "tánc"),
        "sport": ("sport", "meccs", "futás", "bajnokság", "mérkőzés"),
        "turista": ("túra", "séta", "kirándulás", "városnézés"),
    }
    result = [name for name, words in mapping.items() if any(word in text for word in words)]
    return result or ["kultúra"]


def title_from_page(soup: BeautifulSoup) -> str:
    heading = soup.find("h1")
    if heading:
        return text_of(heading)
    meta = soup.select_one("meta[property='og:title']")
    return str(meta.get("content", "")).strip() if meta else ""


def clean_title(title: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\s*(?:[-|]\s*(?:Programturizmus|SZKKK|Fehérvári Programok)).*$", "", title, flags=re.I)).strip()


def event_from_jsonld(item: dict[str, Any], soup: BeautifulSoup, page_url: str) -> dict[str, Any] | None:
    title = clean_title(str(item.get("name", "")))
    if not title:
        return None
    start_date, date_and_time = parse_date_and_time(str(item.get("startDate", "")))
    description = extract_description(soup, item)
    location, latitude, longitude = extract_location(soup, "", item)
    image = extract_best_image(soup, page_url, title, item)
    event_url = canonical_url(str(item.get("url") or page_url), page_url)
    return {
        "title": title, "location": location, "latitude": latitude, "longitude": longitude,
        "date": start_date, "date_and_time": date_and_time, "description": description,
        "price": extract_price(soup, description, item), "age_requirement": "Korhatár nélkül",
        "categories": categories(title, description), "header_image": image, "ticket_link": event_url,
    }


def event_card_links(soup: BeautifulSoup, page_url: str) -> list[str]:
    """Csak az ismétlődő programkártyák saját linkjeit adja vissza."""
    found: list[str] = []
    seen: set[str] = set()
    selectors = "article, li, .event, .esemeny, .program, .card, .item, [class*='event'], [class*='program']"
    for container in soup.select(selectors):
        link = container.select_one("a[href]")
        if not link:
            continue
        url = canonical_url(str(link["href"]), page_url)
        path = urllib.parse.urlsplit(url).path.lower()
        card_text = text_of(container)
        if not url or url == canonical_url(page_url, page_url) or not re.search(r"/(?:ajanlat|esemeny|event)[-/]", path):
            continue
        # A kártyában legyen cím és legalább egy dátum/időpont vagy eseményjellegű osztály.
        has_date = bool(re.search(r"20\d{2}[.\-/]|\d{1,2}[:.]\d{2}", card_text))
        classes = " ".join(container.get("class", [])).lower()
        if not has_date and not any(word in classes for word in ("event", "esemeny", "program")):
            continue
        if url not in seen:
            seen.add(url)
            found.append(url)
    return found


def parse_page(url: str) -> tuple[list[dict[str, Any]], list[str]]:
    source = fetch_html(url)
    if not source:
        return [], []
    soup = BeautifulSoup(source, "html.parser")
    for noise in soup.find_all(["nav", "footer", "aside", "noscript"]):
        noise.decompose()
    structured_events = [item for item in jsonld_items(soup) if is_event(item) and item.get("name")]

    # A valódi gyűjtőoldalak gyakran egy teljes Event JSON-LD listát publikálnak.
    if len(structured_events) >= 2:
        return [event for item in structured_events if (event := event_from_jsonld(item, soup, url))], []

    page_title = clean_title(title_from_page(soup))
    child_links = event_card_links(soup, url)
    title_words = set(re.findall(r"[\wáéíóöőúüű]+", page_title.lower()))
    looks_like_hub = bool(title_words.intersection(HUB_TITLE_TOKENS))
    # Egyetlen strukturált Event vagy konkrét dátum: ez részletező oldal, a kapcsolódó linkeket kihagyjuk.
    has_detail_evidence = len(structured_events) == 1 or parse_date_and_time(text_of(soup))[0] is not None
    if len(child_links) >= 2 and (looks_like_hub or not has_detail_evidence):
        return [], child_links

    if structured_events:
        event = event_from_jsonld(structured_events[0], soup, url)
        return ([event] if event else []), []
    if not page_title or any(word in page_title.lower() for word in ("robot", "biztonsági ellenőrzés")):
        return [], []

    description = extract_description(soup)
    full_text = text_of(soup)
    date, date_and_time = parse_date_and_time(f"{page_title} {description} {full_text[:1800]}")
    location, latitude, longitude = extract_location(soup, full_text)
    return [{
        "title": page_title, "location": location, "latitude": latitude, "longitude": longitude,
        "date": date, "date_and_time": date_and_time, "description": description,
        "price": extract_price(soup, full_text), "age_requirement": "Korhatár nélkül",
        "categories": categories(page_title, description),
        "header_image": extract_best_image(soup, url, page_title), "ticket_link": url,
    }], []


def search_event_urls() -> list[str]:
    source = fetch_html(SEARCH_URL)
    if not source:
        return []
    soup = BeautifulSoup(source, "html.parser")
    return event_card_links(soup, SEARCH_URL)


def event_key(event: dict[str, Any]) -> tuple[str, str]:
    title = re.sub(r"\W+", "", str(event["title"]).lower())
    return title, str(event.get("date") or "")


def load_memory() -> list[dict[str, Any]]:
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def keep_active(event: dict[str, Any]) -> bool:
    """A múltbeli, pontos dátumú eseményeket eltávolítja; dátum nélkülinél óvatos."""
    date = event.get("date")
    if not date:
        return True
    try:
        return datetime.strptime(str(date), "%Y-%m-%d").date() >= datetime.now().date()
    except ValueError:
        return True


def merge_with_existing(fresh_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A friss adat felülírja az azonos eseményt, a még aktív régi adat megmarad."""
    merged = {event_key(event): event for event in load_memory() if keep_active(event) and event.get("title")}
    merged.update({event_key(event): event for event in fresh_events})
    return sorted(merged.values(), key=lambda event: event.get("date") or "9999-12-31")[:MAX_EVENTS]


def main() -> None:
    queue = search_event_urls() or [SEARCH_URL]
    queued = set(queue)
    visited: set[str] = set()
    collected: list[dict[str, Any]] = []
    collected_keys: set[tuple[str, str]] = set()
    print(f"Keresés elindult: {len(queue)} kezdő link.")

    while queue and len(collected) < MAX_EVENTS:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        events, sub_links = parse_page(url)
        for sub_link in sub_links:
            if sub_link not in visited and sub_link not in queued and len(queue) < MAX_QUEUE_SIZE:
                queue.append(sub_link)
                queued.add(sub_link)
        for event in events:
            key = event_key(event)
            if key in collected_keys:
                continue
            collected.append(event)
            collected_keys.add(key)
            print(f"[{len(collected)}/{MAX_EVENTS}] Mentve: {event['title']}")
            if len(collected) >= MAX_EVENTS:
                break

    # Soha ne törölje a korábbi events.json-t átmeneti hálózati vagy blokkolási hiba miatt.
    if not collected:
        print("Nem érkezett feldolgozható esemény; a meglévő events.json változatlan marad.")
        return
    merged_events = merge_with_existing(collected)
    with open(MEMORY_FILE, "w", encoding="utf-8") as file:
        json.dump(merged_events, file, ensure_ascii=False, indent=2)
    print(f"Kész: {len(collected)} friss és {len(merged_events)} összes aktív esemény mentve a {MEMORY_FILE} fájlba.")


if __name__ == "__main__":
    main()
