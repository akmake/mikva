# -*- coding: utf-8 -*-
# Download OpenStreetMap raster tiles for Israel (zoom 7-12) into mobile/public/tiles
# so the mikvaot map works fully offline inside the Capacitor WebView.
# One-time asset build. Respectful: identifying User-Agent, small concurrency, skips existing.
import math, os, time, urllib.request, concurrent.futures as cf

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "public", "tiles")
# bbox with a buffer around Israel so low-zoom views aren't grey at the edges
LAT_MIN, LAT_MAX = 28.9, 33.8
LNG_MIN, LNG_MAX = 33.55, 36.45
ZMIN, ZMAX = 7, 12
SERVERS = ["a", "b", "c"]
UA = "mikva-offline-app/1.0 (personal offline mikvaot map; contact yosefdaean@gmail.com)"

def xt(lng, z): return int((lng + 180) / 360 * 2 ** z)
def yt(lat, z):
    r = math.radians(lat)
    return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z)

jobs = []
for z in range(ZMIN, ZMAX + 1):
    x0, x1 = xt(LNG_MIN, z), xt(LNG_MAX, z)
    y0, y1 = yt(LAT_MAX, z), yt(LAT_MIN, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            jobs.append((z, x, y))
print(f"total tiles: {len(jobs)}")

done = {"ok": 0, "skip": 0, "err": 0}
def fetch(job):
    z, x, y = job
    d = os.path.join(OUT, str(z), str(x))
    p = os.path.join(d, f"{y}.png")
    if os.path.exists(p) and os.path.getsize(p) > 0:
        done["skip"] += 1; return
    os.makedirs(d, exist_ok=True)
    s = SERVERS[(x + y) % 3]
    url = f"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
            with open(p, "wb") as f:
                f.write(data)
            done["ok"] += 1
            return
        except Exception as e:
            if attempt == 2:
                done["err"] += 1
                print("ERR", url, e)
            else:
                time.sleep(1.5)

with cf.ThreadPoolExecutor(max_workers=4) as ex:
    for i, _ in enumerate(ex.map(fetch, jobs), 1):
        if i % 200 == 0:
            print(f"  {i}/{len(jobs)} | ok={done['ok']} skip={done['skip']} err={done['err']}")

print(f"DONE ok={done['ok']} skip={done['skip']} err={done['err']}")
# report size
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
print(f"tiles on disk: {tot/1024/1024:.1f} MB")
