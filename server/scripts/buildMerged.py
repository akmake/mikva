# -*- coding: utf-8 -*-
# Build the final replacement dataset for the Mikva collection.
# Base = mikvaot.co.il (server/data/mikvaot_all.json) — authoritative for name/location/address/phone.
# Enrichment = taharat.org.il raw scrape — only the extra fields the new source lacks
#              (kashrut, supervised, openingHours, services, contact), and only on a confident name match.
# Output: server/data/mikvaot_merged.json (shaped to the Mongoose Mikva model).
import json, re, os, datetime

HERE = os.path.dirname(__file__)
NEW = os.path.join(HERE, "..", "data", "mikvaot_all.json")
OLD = r"C:/Users/yosef dahan/Documents/taharat_mikvaot/mikvaot.json"
OUT = os.path.join(HERE, "..", "data", "mikvaot_merged.json")

new = json.load(open(NEW, encoding="utf-8"))
old = json.load(open(OLD, encoding="utf-8"))
CITIES = json.load(open(os.path.join(HERE, "..", "data", "cities.json"), encoding="utf-8"))
# longest-first so "בית שמש" wins over any shorter substring
CITIES_SORTED = sorted(CITIES, key=len, reverse=True)

_CITY_DELIMS = re.compile(r"\s+שכונת|\s+אזור|,|\s+-\s+|\s+בפיקוח|\s+רחוב|\s+רח'|\s+ליד")

def real_city(title, fallback):
    # the true city is embedded in the title; match against the authoritative city list first
    t = title or ""
    for c in CITIES_SORTED:
        if c in t:
            return c
    # fallback for cities not in the dropdown (e.g. Chabad mikvaot the site mis-tagged):
    # parse the city out of the title itself — "מקוה [חב\"ד] <city>[ שכונת.../,/ - ...]"
    if re.match(r"^מקו[הו]ה?\s+", t):
        s = re.sub(r"^מקו[הו]ה?\s+", "", t)
        s = re.sub(r'^חב["\'׳״]*ד\s+', "", s)
        s = _CITY_DELIMS.split(s)[0].strip()
        if s:
            return s
    return fallback

def norm(s):
    s = s or ""
    s = re.sub(r"[\"'׳״,\.\-()]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def new_name(title):
    t = title or ""
    t = re.sub(r"^מקו[הוא]ה?\s+", "", t)          # strip leading מקוה/מקווה
    t = re.split(r"\s+-\s+", t)[0]                 # drop " - <supervision/area>"
    t = re.split(r"\s+בפיקוח", t)[0]
    return t.strip()

# index old raw records by normalized name
old_idx = {}
for r in old:
    nm = norm((r.get("fields") or {}).get("שם המקווה"))
    if nm:
        old_idx.setdefault(nm, []).append(r)

def find_old(rec):
    nk = norm(new_name(rec.get("title", "")))
    nc = norm(rec.get("city", ""))
    cands = old_idx.get(nk)
    if not cands:
        # loose containment match on name (min length guard)
        for k, rs in old_idx.items():
            if len(k) > 4 and (k in nk or nk in k):
                cands = rs; break
    if not cands:
        return None
    if len(cands) == 1:
        return cands[0]
    # prefer same city
    for r in cands:
        oc = norm(r.get("title", "").split(" - ")[-1])
        if nc and (nc in oc or oc in nc):
            return r
    return cands[0]

def supervised_from(text):
    t = text or ""
    return bool(re.search(r"פיקוח|מפוקח", t)) and "אינו בפיקוח" not in t

now = datetime.datetime.utcnow().isoformat() + "Z"
docs, enriched = [], 0
for rec in new:
    o = find_old(rec)
    of = (o.get("fields") if o else {}) or {}
    if o:
        enriched += 1
    nf = rec.get("fields", {}) or {}
    std = nf.get("סטנדרטים ופיקוח:") or nf.get("סטנדרטים ופיקוח") or ""
    lat = rec.get("lat"); lng = rec.get("lng")
    has_coords = bool(lat and lng)
    kashrut = (of.get("כשרות") if o else "") or std
    doc = {
        "externalId": int(rec["id"]),
        "source": "mikvaot.co.il",
        "url": "",
        # --- from NEW (authoritative): name / location / address / phone ---
        "title": rec.get("title", ""),
        "name": new_name(rec.get("title", "")),
        "city": real_city(rec.get("title", ""), rec.get("city", "")),
        "address": rec.get("address", ""),
        "phone": rec.get("phone", ""),
        "lat": float(lat) if has_coords else None,
        "lng": float(lng) if has_coords else None,
        "geoPrecision": "exact" if has_coords else None,
        "geocodedAt": now if has_coords else None,
        "waze": rec.get("waze", ""),
        "googleMaps": rec.get("googleMaps", ""),
        # --- extra fields the new source lacks: from OLD when matched (else best-effort from new) ---
        "contact": (of.get("איש קשר") if o else "") or "",
        "kashrut": kashrut,
        "supervised": supervised_from(kashrut),
        "openingHours": (of.get("שעות פתיחה") if o else "") or nf.get("שעות פתיחה:") or nf.get("שעות פתיחה") or "",
        "services": (of.get("שירותים במקווה") if o else "") or "",
        "notes": (of.get("הערות") if o else "") or "",
        # --- full raw preservation: new fields + balanit, plus matched taharat fields ---
        "fields": {
            **nf,
            "בלנית/נייד": rec.get("balanit", ""),
            **({"_taharat": of} if o else {}),
        },
        "scrapedAt": now,
    }
    docs.append(doc)

json.dump(docs, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("merged docs:", len(docs))
print("enriched from taharat (name match):", enriched)
print("with coords:", sum(1 for d in docs if d["lat"] is not None))
print("with kashrut:", sum(1 for d in docs if d["kashrut"]))
print("unique externalIds:", len({d["externalId"] for d in docs}))
