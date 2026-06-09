#!/usr/bin/env python3
"""
Build coherent test fixtures from real production data.

Strategy:
1. Pick 5 JM rows → gives us 5 adamlink addresses + WGS84 points
2. Find LPS rows that reference those addresses (places + all their sibling registries)
3. Stream beeldbank.csv, pick rows whose `address` column is in our LPS addresses
4. If few matches, add LPS rows that match addresses seen in beeldbank
5. Filter adressen.csv to only the addresses we actually use
"""
import csv
import sys

SRC = "/home/m/Documents/projects/2026/atm-postgis-integration/data"
DST = "/home/m/Documents/projects/2024/amsterdam_time_machine/packages/db/src/__tests__/fixtures"

csv.field_size_limit(sys.maxsize)

ADAMLINK_PREFIX = "https://adamlink.nl/geo/address/"
ADDR_COLS = ['pw-1943', 'pw-1909', 'obelt-1920', 'loman-1976',
             'bevolkingsregister-1870', 'wijken-1853', 'percelen-1832']

# Step 1: Take first 5 JM rows
print("1. Sampling 5 JM rows...")
jm_rows = []
with open(f"{SRC}/results_jm.csv") as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        if i >= 5:
            break
        jm_rows.append(row)

jm_addrs = [r['address'].replace(ADAMLINK_PREFIX, '') for r in jm_rows]
print(f"   JM addresses: {jm_addrs}")

# Step 2: Find LPS rows for JM addresses
print("2. Finding LPS rows that reference JM addresses...")
lps_rows = []
lps_header = None
with open(f"{SRC}/20230920-lps.csv") as f:
    reader = csv.DictReader(f)
    lps_header = reader.fieldnames
    for row in reader:
        for col in ADDR_COLS:
            if row.get(col, '').strip() in jm_addrs:
                lps_rows.append(row)
                break
print(f"   Found {len(lps_rows)} LPS rows")

# Step 3: Stream beeldbank.csv — collect rows matching our URIs + candidates for enrichment
print("3. Streaming beeldbank.csv...")
current_uris = set()
for row in lps_rows:
    for col in ADDR_COLS:
        v = row.get(col, '').strip()
        if v:
            current_uris.add(f"{ADAMLINK_PREFIX}{v}")

MATCH_CAP = 15
CANDIDATE_CAP = 10

matched_bb = []
matched_keys = set()  # (resource, address) dedup
candidate_bb = []     # one row per novel adamlink address not in current_uris
candidate_addrs = set()

bb_header = None
scanned = 0
with open(f"{SRC}/beeldbank.csv", newline='') as f:
    reader = csv.DictReader(f)
    bb_header = reader.fieldnames
    for row in reader:
        scanned += 1
        addr = row.get('address', '').strip()
        if not addr or not addr.startswith(ADAMLINK_PREFIX):
            continue
        res = row.get('resource', '').strip()
        if not res:
            continue
        key = (res, addr)
        if addr in current_uris:
            if key not in matched_keys and len(matched_bb) < MATCH_CAP:
                matched_keys.add(key)
                matched_bb.append(row)
        elif addr not in candidate_addrs and len(candidate_bb) < CANDIDATE_CAP:
            candidate_addrs.add(addr)
            candidate_bb.append(row)
        if len(matched_bb) >= MATCH_CAP and len(candidate_bb) >= CANDIDATE_CAP:
            break
        if scanned % 500_000 == 0:
            print(f"   scanned {scanned:,} rows, matched {len(matched_bb)}, candidates {len(candidate_bb)}")

print(f"   Scanned {scanned:,} rows")
print(f"   Matched from JM-linked LPS: {len(matched_bb)}")

# Step 4: If few matches, enrich via candidate addresses
unique_matches = len({r['resource'] for r in matched_bb})
if unique_matches < 3 and candidate_bb:
    take = min(5, len(candidate_bb))
    print(f"   Only {unique_matches} unique images — enriching with {take} candidate addresses")
    enrich_ids = [r['address'].replace(ADAMLINK_PREFIX, '') for r in candidate_bb[:take]]

    with open(f"{SRC}/20230920-lps.csv") as f:
        reader = csv.DictReader(f)
        for row in reader:
            for col in ADDR_COLS:
                if row.get(col, '').strip() in enrich_ids:
                    if row not in lps_rows:
                        lps_rows.append(row)
                    break
    print(f"   LPS rows now: {len(lps_rows)}")

    # Add enrichment bb rows to output
    matched_bb.extend(candidate_bb[:take])

bb_out = matched_bb

# Synthetic street-fallback row, kept in sync with the hand-maintained
# fixtures/seed-streets.ttl (which this script does not generate). Empty address +
# a street URI → exercises beeldbank's street fallback and the LINESTRING
# rasterisation path in the integration seed, which real address-resolved rows
# never reach. seedTestData ingests seed-streets.ttl before beeldbank.
bb_out.append({
    'resource': 'https://ams-migrate.memorix.io/resources/records/seed-street-feature-0001',
    'title': 'Seed Street Image',
    'thumbnail': 'https://images.memorix.nl/seed-thumb.jpg',
    'startDate': '1950-01-01',
    'endDate': '1950-12-31',
    'textDate': '1950',
    'address': '',
    'street': 'https://adamlink.nl/geo/street/seed-straat/1',
})

print(f"   Final beeldbank rows: {len(bb_out)}, unique images: {len({r['resource'] for r in bb_out})}")

# Step 5: Collect all adresids we need, extract adressen rows
print("4. Extracting adressen rows...")
all_addrs = set()
for row in lps_rows:
    for col in ADDR_COLS:
        v = row.get(col, '').strip()
        if v:
            all_addrs.add(v)

adressen_rows = []
adressen_header = None
with open(f"{SRC}/20230920-adressen.csv") as f:
    reader = csv.DictReader(f)
    adressen_header = reader.fieldnames
    for row in reader:
        if row['adresid'] in all_addrs:
            adressen_rows.append(row)
print(f"   {len(adressen_rows)} adressen rows for {len(all_addrs)} address IDs")

# Write all fixtures
print("5. Writing fixtures...")
with open(f"{DST}/lps.csv", 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=lps_header, quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    for row in lps_rows:
        writer.writerow(row)
print(f"   lps.csv: {len(lps_rows)+1} lines")

with open(f"{DST}/adressen.csv", 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=adressen_header, quoting=csv.QUOTE_MINIMAL, extrasaction='ignore')
    writer.writeheader()
    for row in adressen_rows:
        writer.writerow(row)
print(f"   adressen.csv: {len(adressen_rows)+1} lines")

with open(f"{DST}/beeldbank.csv", 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=bb_header, quoting=csv.QUOTE_MINIMAL, extrasaction='ignore')
    writer.writeheader()
    for row in bb_out:
        writer.writerow(row)
print(f"   beeldbank.csv: {len(bb_out)+1} lines")

jm_header = list(jm_rows[0].keys())
with open(f"{DST}/jm.csv", 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=jm_header, quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    for row in jm_rows:
        writer.writerow(row)
print(f"   jm.csv: {len(jm_rows)+1} lines")

# Summary
print("\n=== Summary ===")
print(f"Places (LPS rows): {len(lps_rows)}")
print(f"Addresses: {len(all_addrs)}")
print(f"Beeldbank rows: {len(bb_out)}, unique images: {len({r['resource'] for r in bb_out})}")
print(f"JM persons: {len(jm_rows)}")
