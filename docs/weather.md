# Atmo weather integration

Provider: Visual Crossing Weather, Timeline public no-key API.
Verified 2026-11-09: one live city forecast request returned HTTP 200 and CORS `*`.

## Usage and attribution

- Commercial use and caching are permitted by the public no-key guide and free-plan documentation.
- This is **not** the registered account's guaranteed 1,000-record/day allowance: no-key access is subject to IP-based fair-use controls, which can change.
- Every displayed forecast includes a visible, clickable “Időjárási adatok: Visual Crossing Weather” attribution next to the data. Do not remove it or imply endorsement.
- No private API key is shipped in JavaScript or stored in the repository.
- Only daily datetime/tempmax/icon fields are requested. No historical or statistical predictions are used for dates beyond the returned forecast.
- On HTTP 429, further requests pause for at least 60 seconds or the longer Retry-After value. The UI reports unavailable data; it does not circumvent limits or retry in a loop.

## Request behavior

Ordinary event details/inline details: resolve the event city from an explicit City/Város/Település field, a known city in Location, or a known city within 35 km of event coordinates. Never substitute the user's selected city for the event city. Unknown cities require a City field; no forecast is shown rather than silently choosing the wrong city.

One full city forecast is cached for 3 hours, reused across event dates, and stored in localStorage. In-flight requests for the same city are deduplicated. Maximum 50 recent city entries are persisted. Expired/failed responses are not reused as fresh forecasts. The cache is **per browser/app installation**, not shared across all visitors. A shared server cache can be added later if necessary.

Each `showPlannerEvent` call requests the event's own latitude/longitude and date anew, bypassing city and browser HTTP caches. Re-rendering attendance controls does not itself trigger weather requests. Past events, undated recurring events and dates beyond today +14 are not queried. Provider throttling still takes precedence over fresh requests.

The provider receives the visitor's IP address and the requested event city/venue coordinates. This feature does not request the visitor's personal GPS position. Mention this third-party weather service in the privacy notice when the final notice is prepared.

## Sources

- https://www.visualcrossing.com/resources/documentation/weather-api/free-weather-api-no-key/
- https://www.visualcrossing.com/resources/documentation/what-can-i-do-with-the-visual-crossing-weather-free-plan/
- https://www.visualcrossing.com/resources/documentation/weather-data/how-to-properly-cite-or-attribute-visual-crossing-weather-data/
- https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/

## Checks

`node tests/weather.test.cjs` verifies request counts, city reuse, persistence/TTL, fresh venue requests, date limits, retries after failures and rate limiting with mocked HTTP responses.
`node tests/weather.browser.cjs` verifies visible source links, city-vs-venue routing, repeated planner opens and stale-response protection in a mobile browser.
