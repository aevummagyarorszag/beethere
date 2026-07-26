import json
import csv
import urllib.request

# A publikált Google Táblázat CSV hivatkozása
SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPfSI82U3LFTE93Wj_ZaGSqNHyxpmAXnnt6ixl2XBgqNUfHkbXZeS4TV_WEY3DB1mESAsRZRtOY8HZ/pub?output=csv"
MEMORY_FILE = "events.json"

def fetch_sheet_data():
    req = urllib.request.Request(SHEET_CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req)
    lines = [line.decode('utf-8') for line in response.readlines()]
    reader = csv.DictReader(lines)
    
    events = []
    for row in reader:
        title = row.get("Title", "").strip()
        if not title:
            continue
        
        # Átalakítás a táblázat oszlopai alapján
        event = {
            "Title": title,
            "Location": row.get("Location", "").strip(),
            "Latitude": float(row.get("Latitude")) if row.get("Latitude") else 47.1912,
            "Longitude": float(row.get("Longitude")) if row.get("Longitude") else 18.4095,
            "Date": row.get("Date", "").strip(),
            "Time": row.get("Time", "").strip(),
            "Date and Time": f"{row.get('Date', '').strip()} {row.get('Time', '').strip()}".strip(),
            "Description": row.get("Description", "").strip(),
            "Price": row.get("Price", "").strip(),
            "Age Requirement": row.get("Age Requirement", "").strip(),
            "Long description": row.get("Long description", "").strip(),
            "Header Image": row.get("Header Image", "").strip(),
            "Ticket Link": row.get("Ticket Link", "").strip(),
            "Category": row.get("Category", "").strip(),
            "Featured": row.get("Featured", "").strip()
        }
        events.append(event)
    
    return events

def main():
    try:
        events = fetch_sheet_data()
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"✅ SIKER! {len(events)} esemény kimentve az {MEMORY_FILE} fájlba.")
    except Exception as e:
        print(f"❌ Hiba a táblázat beolvasásakor: {e}")

if __name__ == "__main__":
    main()
