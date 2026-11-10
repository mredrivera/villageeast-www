#!/usr/bin/env python3
"""One-time import of the files downloaded from the old villageeast.org (GoDaddy) site.

Reads the download manifest, drops exact duplicates, gives every file a clean name, category, date
and visibility, copies it into content/documents/<category>/ and writes content/documents/catalog.json.
`npm run seed` then uploads the files to private Supabase Storage and fills the `documents` table.

Usage: python3 scripts/import-legacy.py <manifest.txt> <downloaded-files-dir>
"""
import json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "documents"

# id | category | visibility | date | archived | title | description
CATALOG = """
001|notice|members|2026-01-15|y|Social Club Survey #1 (paper form)|Replaced by the online Social Club survey in the member area.
002|ballot|members|2026-06-06|n|2026 Bylaw Amendment Ballot (updated)|
003|ballot|members|2026-06-06|n|2026 Annual Membership Meeting Ballots|
004|notice|members|2026-08-30|n|Community Potluck Flyer (August 30)|
005|ballot|members||n|Property Owner Proxy Ballot|
006|governing|public||n|Declaration of Protective Covenants|
007|governing|public||n|By-Laws (with cumulative revisions)|
008|governing|public||n|Articles of Incorporation|
009|rules|public|2022-02-01|n|Architectural Committee Guidelines (rev. 2022)|With additional covenant interpretations and guidelines.
010|forms|public|2014-08-13|n|Architectural Approval Form|Paper form (rev. 15). Owners can also submit this request online.
011|rules|public||n|Facility Rules and Requirements|For the pool, activity courts, boat ramp and docks.
012|rules|public|2009-10-01|n|Rental Rules (rev. October 2009)|
013|rules|public||n|Renter Rules|
014|forms|public|2011-07-01|n|Boat / Trailer Storage Contract|Paper form. Owners can also apply online.
015|rules|public||n|Trailer Parking Rules|
016|rules|public|2014-08-25|n|Association Complaint Procedures|
017|governing|members||n|Legal Opinion Letter: Virginia POA Act|Regarding non-applicability of the Virginia Property Owners' Association Act to Village East POA.
018|rules|public||n|Policy for Deer Herd Culling|
019|notice|members||n|Deer Report|
020|forms|public||n|Permission to Hunt Form|Paper culling permission form. Owners can also respond online.
021|governing|public||n|Costs for Documents|
022|forms|public||n|Village North Associate Membership Contract|
023|notice|members||n|Non-Compliance Action Review: Letter to Membership|
025|newsletter|members|2026-07-01|n|Summer 2026 Newsletter|
026|newsletter|members|2026-04-01|n|Spring 2026 Newsletter|
027|newsletter|members|2026-01-15|n|Winter 2026 Newsletter|
028|newsletter|members|2024-10-01|n|President's Letter: October 2024|
029|newsletter|members|2024-03-01|n|Spring 2024 Newsletter|
030|newsletter|members|2023-05-01|n|Village East Voice: May 2023|
031|newsletter|members|2022-05-01|n|Village East Voice: May 2022|
032|newsletter|members|2021-05-01|n|Spring 2021 Newsletter|
033|newsletter|members|2018-04-01|n|Spring 2018 Newsletter|
034|newsletter|members|2017-10-01|n|Village East Voice: Fall 2017|
035|newsletter|members|2017-04-01|n|Village East Voice: Spring 2017|
036|newsletter|members|2016-10-01|n|Village East Voice: Fall 2016|
037|newsletter|members|2016-05-01|n|Village East Voice: Spring 2016|
038|newsletter|members|2015-05-01|n|Village East Voice: Spring 2015|
039|newsletter|members|2014-10-01|n|Village East Voice: Fall 2014|
040|newsletter|members|2014-05-01|n|Village East Voice: Spring 2014|
041|newsletter|members|2013-10-01|n|Village East Voice: Fall 2013|
042|newsletter|members|2013-04-01|n|Village East Voice: Spring 2013|
043|board|members|2026-03-01|n|Board and Committees (March 2026)|
044|board|members|2024-06-01|y|Board and Committees (June 2024)|
045|board|members|2024-05-01|y|Board Candidates 2024|
046|minutes|members|2026-09-24|n|Board Meeting Minutes|
047|agenda|members|2026-09-24|n|Board Meeting Agenda|
048|minutes|members|2026-06-06|n|Annual Membership Meeting Minutes|
049|minutes|members|2026-06-06|n|Board Meeting Minutes (post-annual meeting)|
050|agenda|members|2026-06-06|n|Annual Membership Meeting Agenda|
051|minutes|members|2026-04-29|n|Board Meeting Minutes|
052|agenda|members|2026-04-29|n|Board Meeting Agenda|
053|minutes|members|2026-03-05|n|Board Meeting Minutes|
054|agenda|members|2026-03-05|n|Board Meeting Agenda|
055|minutes|members|2025-12-11|n|Board Meeting Minutes|
056|minutes|members|2025-09-25|n|Board Meeting Minutes|
057|minutes|members|2025-06-07|n|Annual Membership Meeting Minutes|
058|minutes|members|2025-04-22|n|Board Meeting Minutes|
059|ballot|members|2025-06-07|y|Bylaw Ballot (June 2025)|
060|agenda|members|2025-04-22|n|Board Meeting Agenda (draft)|
061|minutes|members|2025-03-13|n|Board Meeting Minutes|
062|agenda|members|2025-03-13|n|Board Meeting Agenda (draft)|
063|agenda|members|2024-12-05|n|Board Meeting Agenda (draft)|
064|minutes|members|2024-12-05|n|Board Meeting Minutes|
065|minutes|members|2024-09-18|n|Board Meeting Minutes|
066|realtor|public||n|VEPOA Governing Documents (complete set)|Covenants, by-laws and rules in a single file.
067|realtor|public|2023-02-21|n|Disclosure Packet (rev. February 2023)|
068|minutes|members|2024-03-14|n|Board Meeting Minutes (unapproved draft)|
069|minutes|members|2024-04-25|n|Board Meeting Minutes (unapproved draft)|
070|minutes|members|2025-09-25|y|Board Meeting Minutes (revision 1, superseded)|
071|minutes|members|2025-06-24|n|Board Meeting Minutes|
072|agenda|members|2023-06-03|n|Board Meeting Agenda|
073|agenda|members|2024-06-08|n|Annual Membership Meeting Agenda|
074|minutes|members|2024-06-08|n|Annual Membership Meeting Minutes (updated)|
075|minutes|members|2024-06-08|y|Annual Membership Meeting Minutes (original, superseded)|
076|financial|members|2025-12-31|n|2025 Profit & Loss Report|
077|financial|members|2024-12-31|n|2024 Profit & Loss Report|
078|financial|members|2024-06-08|n|2024 Finance Report (annual meeting)|
079|financial|members|2023-12-07|n|Treasurer's Report to the Board|
080|financial|members|2024-03-14|n|Treasurer's Report to the Board|
081|financial|members|2023-12-31|n|2023 Year-End Report|
082|financial|members|2024-01-01|n|2024 Approved Reserve Analysis|
083|financial|members|2024-01-01|n|2024 Approved Operating & Maintenance Budget|
085|financial|members|2023-11-01|y|2024 Proposed Reserve Analysis|
086|financial|members|2023-09-19|n|Treasurer's Report to the Board|
087|financial|members|2023-01-01|n|2023 Annual Dues Information|
088|financial|members|2023-06-03|n|2023 Membership Meeting Presentation|
089|financial|members|2023-04-27|n|Treasurer's Report to the Board|
090|financial|members|2023-03-02|n|Treasurer's Report to the Board|
091|financial|members|2022-12-31|n|2022 Year-End Financial Report|
092|financial|members|2022-12-01|n|Treasurer's Report to the Board|Includes financials as of 11/30/2022.
093|financial|members|2021-12-31|n|2019-2021 Annual Reports|
094|financial|members|2023-01-01|n|2023 Capital Improvements Budget|
095|financial|members|2023-01-01|n|Reserve Analysis 2023-2028|
096|financial|members|2023-01-01|n|2023 Approved Operating & Maintenance Budget|
097|governing|public|2022-03-01|n|Policy & Procedures Resolution (updated March 2022)|
098|financial|members|2022-01-31|n|Audit Report (January 2022)|
"""
SKIPPED_DUPLICATES = {"024": "019", "084": "083"}
MIME = {".pdf": "application/pdf", ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and").replace("'", "")).strip("-")

def main(manifest, src):
    src = Path(src)
    urls, files = {}, {}
    for line in Path(manifest).read_text().splitlines():
        parts = line.split("|")
        urls[parts[0]] = parts[-1]
        files[parts[0]] = src / parts[1] / f"{parts[0]}_{parts[-2]}"
    if OUT.exists():
        shutil.rmtree(OUT)
    out, used = [], set()
    for row in CATALOG.strip().splitlines():
        id_, cat, vis, date, arch, title, desc = row.split("|")
        f = files[id_]
        ext = f.suffix.lower()
        name = f"{date + '-' if date else ''}{slug(title)}"
        while name in used:
            name += "-2"
        used.add(name)
        rel = f"{cat}/{name}{ext}"
        (OUT / cat).mkdir(parents=True, exist_ok=True)
        shutil.copyfile(f, OUT / rel)
        out.append({"path": rel, "title": title, "description": desc or None, "category": cat, "visibility": vis,
                    "doc_date": date or None, "is_archived": arch == "y", "file_name": f"{name}{ext}",
                    "mime_type": MIME[ext], "size_bytes": f.stat().st_size, "legacy_url": urls[id_]})
    (OUT / "catalog.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"{len(out)} documents imported; {len(SKIPPED_DUPLICATES)} exact duplicates skipped: {SKIPPED_DUPLICATES}")

if __name__ == "__main__":
    main(*sys.argv[1:3])
