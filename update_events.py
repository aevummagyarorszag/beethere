import csv
import json
import urllib.request

SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPfSI82U3LFTE93Wj_ZaGSqNHyxpmAXnnt6ixl2XBgqNUfHkbXZeS4TV_WEY3DB1mESAsRZRtOY8HZ/pub?output=csv"
MEMORY_FILE = "events.json"


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
                "Location": (row.get("Location") or "").strip(),
                "Latitude": decimal_or_default(row.get("Latitude"), 47.1912),
                "Longitude": decimal_or_default(row.get("Longitude"), 18.4095),
                "Date": date,
                "Time": time,
                "Date and Time": f"{date} {time}".strip(),
                "Description": (row.get("Description") or "").strip(),
                "Price": (row.get("Price") or "").strip(),
                "Age Requirement": (row.get("Age Requirement") or "").strip(),
                "Long description": (row.get("Long description") or row.get("Long Description") or "").strip(),
                "Header Image": (row.get("Header Image") or "").strip(),
                "Ticket Link": (row.get("Ticket Link") or "").strip(),
                "Category": (row.get("Category") or "").strip(),
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
