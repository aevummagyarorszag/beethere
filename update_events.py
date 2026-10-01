import csv
import json
import urllib.request

SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPfSI82U3LFTE93Wj_ZaGSqNHyxpmAXnnt6ixl2XBgqNUfHkbXZeS4TV_WEY3DB1mESAsRZRtOY8HZ/pub?output=csv"
MEMORY_FILE = "events.json"
# Google Sheets: use the optional "Aktuális" column for seasonal/editorial topics,
# for example "Halloween". Separate multiple topics with commas.

PRICE_OVERRIDES = {
    ("Deák Bill Blues Band – Rossz vér turné", "2026.10.17"): "8 800 Ft-tól",
    ("Koncz Zsuzsa Nagykoncert", "2026.10.20"): "13 990 Ft-tól",
    ("Charlie - Mindenen túl...", "2026.11.15"): "13 990–16 990 Ft",
    ("Hans Zimmer gyertyafényes koncert", "2026.12.15"): "13 687–15 747 Ft",
    ("Noches de España", "2026.10.03"): "9 670 Ft",
    ("Marica grófnő", "2026.10.04"): "6 000–7 300 Ft",
    ("Csárdáskirálynő", "2026.10.24"): "8 990–13 990 Ft",
    ("Vivaldi: A négy évszak - gyertyafényes koncert", "2026.10.24"): "12 900–14 900 Ft",
}


def decimal_or_default(value, default):
    try:
        return float((value or "").strip())
    except (TypeError, ValueError):
        return default


def fetch_sheet_data():
    request = urllib.request.Request(SHEET_CSV_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        rows = csv.DictReader(line.decode("utf-8-sig") for line in response.readlines())
        events = []
        for row in rows:
            title = (row.get("Title") or "").strip()
            if not title:
                continue
            date = (row.get("Date") or "").strip()
            time = (row.get("Time") or "").strip()
            events.append({
                "Title": title,
                "Type": (row.get("Típus") or row.get("Type") or "egyszeri").strip(),
                "Location": (row.get("Location") or "").strip(),
                "Latitude": decimal_or_default(row.get("Latitude"), 47.1912),
                "Longitude": decimal_or_default(row.get("Longitude"), 18.4095),
                "Date": date,
                "Time": time,
                "Date and Time": f"{date} {time}".strip(),
                "Description": (row.get("Description") or "").strip(),
                "Price": PRICE_OVERRIDES.get((title, date), (row.get("Price") or "").strip()),
                "Age Requirement": (row.get("Age Requirement") or "").strip(),
                "Long description": (row.get("Long description") or row.get("Long Description") or "").strip(),
                "Header Image": (row.get("Header Image") or "").strip(),
                "Ticket Link": (row.get("Ticket Link") or "").strip(),
                "Category": (row.get("Category") or "").strip(),
                "Current Topics": (row.get("Aktuális") or row.get("Aktualis") or row.get("Current Topics") or "").strip(),
                "Featured": (row.get("Featured") or "").strip(),
            })
    return events


def main():
    events = fetch_sheet_data()
    with open(MEMORY_FILE, "w", encoding="utf-8") as file:
        json.dump(events, file, ensure_ascii=False, indent=2)
    print(f"Updated {MEMORY_FILE}: {len(events)} events")


if __name__ == "__main__":
    main()
