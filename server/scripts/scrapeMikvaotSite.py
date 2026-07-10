# -*- coding: utf-8 -*-
# Scrape all mikvaot from mikvaot.co.il via the WordPress admin-ajax "ajax_search" endpoint.
import re, json, time, sys, urllib.parse, urllib.request, html

AJAX = "https://www.mikvaot.co.il/wp-admin/admin-ajax.php"
cities = json.load(open("cities.json", encoding="utf-8"))

def fetch(city):
    body = "action=ajax_search&data=" + urllib.parse.quote("wdw_search=" + city)
    req = urllib.request.Request(
        AJAX, data=body.encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                 "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if attempt == 2: raise
            time.sleep(2)

def strip_tags(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()

def parse(city, resp):
    items = []
    for block in re.findall(r'<div\s+class="blockqa"\s+data-id="(\d+)">(.*?)(?=<div\s+class="blockqa"|</ul>|\Z)', resp, re.S):
        did, chunk = block
        tm = re.search(r'class="titleMainQa[^"]*">(.*?)</h2>', chunk, re.S)
        title = strip_tags(tm.group(1)) if tm else ""
        am = re.search(r'class="answerDiv"[^>]*>(.*?)</div>', chunk, re.S)
        ans_html = am.group(1) if am else ""
        # label: value pairs
        fields = {}
        for lab, val in re.findall(r'<strong>(.*?)</strong>\s*:?\s*(.*?)(?=<strong>|<a |<br\s*/?>\s*<br|\Z)', ans_html, re.S):
            l = strip_tags(lab); v = strip_tags(val)
            if l: fields[l] = v
        waze = re.search(r'href="(https://[^"]*waze[^"]*)"', ans_html)
        gmap = re.search(r'href="(https://[^"]*(?:goo\.gl/maps|google\.[^"]*maps)[^"]*)"', ans_html)
        lat = lng = None
        if waze:
            c = re.search(r'll=([-\d.]+)%2C([-\d.]+)', waze.group(1)) or re.search(r'll=([-\d.]+),([-\d.]+)', urllib.parse.unquote(waze.group(1)))
            if c: lat, lng = c.group(1), c.group(2)
        items.append({
            "id": did, "city": city, "title": title,
            "address": fields.get("כתובת") or next((v for k,v in fields.items() if "כתובת" in k), ""),
            "phone": next((v for k,v in fields.items() if "טלפון" in k), ""),
            "balanit": next((v for k,v in fields.items() if "בלנית" in k or "נייד" in k), ""),
            "lat": lat, "lng": lng,
            "waze": waze.group(1) if waze else "",
            "googleMaps": gmap.group(1) if gmap else "",
            "fields": fields,
            "answerText": strip_tags(ans_html),
        })
    return items

allrows, seen = [], set()
for i, city in enumerate(cities, 1):
    try:
        resp = fetch(city)
    except Exception as e:
        print(f"[{i}/{len(cities)}] {city}: ERROR {e}", flush=True); continue
    rows = parse(city, resp)
    new = 0
    for r in rows:
        key = r["id"]
        if key in seen: continue
        seen.add(key); allrows.append(r); new += 1
    print(f"[{i}/{len(cities)}] {city}: {len(rows)} items ({new} new) | total {len(allrows)}", flush=True)
    time.sleep(0.4)

json.dump(allrows, open("mikvaot_all.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("DONE. unique mikvaot:", len(allrows))
