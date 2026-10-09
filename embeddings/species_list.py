"""Build the regional species list for NaturDex from GBIF.

Picks every species with at least --min-obs human observations in the region
(since 2000), then fetches its full taxonomy (BioCLIP's text prompt needs it),
its English (and Spanish) common names, and its IUCN Red List category.

Usage:
    uv run python species_list.py                       # Asturias (default)
    uv run python species_list.py --gadm ESP.17_1 --name asturias --min-obs 20

Find another region's GADM id at https://api.gbif.org/v1/geocode/gadm/search?q=<name>
"""

import argparse
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

API = "https://api.gbif.org/v1"
HERE = Path(__file__).parent
CACHE = HERE / "cache" / "gbif"

# Groups a child can find on a field trip: GBIF taxon key -> label shown in the app
GROUPS = {
    7707728: "plants",  # Tracheophyta (vascular plants)
    212: "birds",
    359: "mammals",
    216: "insects",
    131: "amphibians",
    11592253: "reptiles",  # Squamata (lizards and snakes)
    11418114: "reptiles",  # Testudines (turtles)
    5: "fungi",
    367: "arachnids",
    225: "snails and slugs",  # Gastropoda
}

RANKS = ["kingdom", "phylum", "class", "order", "family", "genus"]

# Kid-friendly "kind" for species without a common name ("a moth: Idaea aversata").
# Checked from the most specific rank to the least; first match wins.
KINDS = {
    "Papilionidae": "butterfly", "Pieridae": "butterfly", "Nymphalidae": "butterfly",
    "Lycaenidae": "butterfly", "Hesperiidae": "butterfly", "Riodinidae": "butterfly",
    "Lepidoptera": "moth",
    "Formicidae": "ant", "Apidae": "bee", "Megachilidae": "bee", "Andrenidae": "bee",
    "Halictidae": "bee", "Colletidae": "bee", "Vespidae": "wasp", "Hymenoptera": "wasp",
    "Coccinellidae": "ladybird", "Coleoptera": "beetle",
    "Syrphidae": "hoverfly", "Diptera": "fly",
    "Odonata": "dragonfly", "Orthoptera": "grasshopper", "Hemiptera": "bug",
    "Phasmida": "stick insect", "Mantodea": "mantis", "Dermaptera": "earwig",
    "Neuroptera": "lacewing", "Trichoptera": "caddisfly", "Ephemeroptera": "mayfly",
    "Plecoptera": "stonefly", "Insecta": "insect",
    "Araneae": "spider", "Opiliones": "harvestman", "Arachnida": "arachnid",
    "Lecanoromycetes": "lichen", "Fungi": "fungus",
    "Gastropoda": "snail or slug",
    "Aves": "bird", "Mammalia": "mammal", "Amphibia": "amphibian",
    "Squamata": "reptile", "Testudines": "turtle",
    "Poaceae": "grass", "Pinopsida": "conifer", "Polypodiopsida": "fern",
    "Plantae": "plant",
}

session = requests.Session()


def get(path, **params):
    """GET a GBIF endpoint, caching the JSON on disk so re-runs are fast."""
    key = (path + "?" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))).strip("/?")
    file = CACHE / (key.replace("/", "_").replace("?", "__").replace("&", "_").replace("=", "-") + ".json")
    if file.exists():
        return json.loads(file.read_text(encoding="utf-8"))
    response = session.get(f"{API}/{path}", params=params, timeout=60)
    response.raise_for_status()
    data = response.json()
    file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def species_counts(gadm, taxon_key):
    """Number of human observations per species of one group in the region."""
    data = get(
        "occurrence/search",
        gadmGid=gadm,
        taxonKey=taxon_key,
        basisOfRecord="HUMAN_OBSERVATION",
        occurrenceStatus="PRESENT",
        year="2000,2026",
        limit=0,
        facet="speciesKey",
        facetLimit=3000,
    )
    return {int(c["name"]): c["count"] for c in data["facets"][0]["counts"]} if data["facets"] else {}


def common_name(names, language):
    """Most repeated common name in a language (GBIF mixes several sources)."""
    spellings = [n["vernacularName"].strip() for n in names if n.get("language") == language]
    if not spellings:
        return None
    # Vote ignoring case, then keep that name's most repeated exact spelling
    winner = Counter(s.lower() for s in spellings).most_common(1)[0][0]
    name = Counter(s for s in spellings if s.lower() == winner).most_common(1)[0][0]
    return name[0].upper() + name[1:]


def describe(key):
    """Taxonomy, common names and IUCN category of one species."""
    info = get(f"species/{key}")
    names = get(f"species/{key}/vernacularNames", limit=300)["results"]
    try:
        iucn = get(f"species/{key}/iucnRedListCategory").get("code")
    except requests.HTTPError:
        iucn = None
    taxonomy = {rank: info.get(rank) for rank in RANKS}
    kind = next((KINDS[t] for t in reversed(taxonomy.values()) if t in KINDS), None)
    return {
        "key": key,
        "scientific": info.get("canonicalName") or info["scientificName"],
        "es": common_name(names, "spa"),
        "en": common_name(names, "eng"),
        "kind": kind,
        "taxonomy": taxonomy,
        "iucn": iucn,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--gadm", default="ESP.17_1", help="GADM id of the region (default: Asturias)")
    parser.add_argument("--name", default="asturias", help="name used for the output file")
    parser.add_argument("--min-obs", type=int, default=20, help="minimum observations per species")
    args = parser.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)

    selected = {}  # species key -> (group, observations)
    for taxon_key, group in GROUPS.items():
        counts = species_counts(args.gadm, taxon_key)
        kept = {k: n for k, n in counts.items() if n >= args.min_obs}
        print(f"{group:20} {len(kept):5} species")
        for k, n in kept.items():
            selected[k] = (group, n)

    print(f"Fetching details of {len(selected)} species from GBIF...")
    with ThreadPoolExecutor(max_workers=8) as pool:
        species = list(pool.map(describe, selected))

    for s in species:
        s["group"], s["observations"] = selected[s["key"]]

    # GBIF sometimes has two keys for the same name: keep the most observed, add up the counts
    merged = {}
    for s in sorted(species, key=lambda s: -s["observations"]):
        if s["scientific"] in merged:
            merged[s["scientific"]]["observations"] += s["observations"]
        else:
            merged[s["scientific"]] = s
    species = sorted(merged.values(), key=lambda s: (s["group"], -s["observations"]))

    output = HERE / "data" / f"{args.name}_species.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "region": {"name": args.name, "gadm": args.gadm},
                "source": "GBIF.org occurrence search (HUMAN_OBSERVATION, 2000-2026)",
                "min_observations": args.min_obs,
                "species": species,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    with_en = sum(1 for s in species if s["en"])
    print(f"Saved {len(species)} species to {output.relative_to(HERE)}")
    print(f"  with an English common name: {with_en} ({with_en * 100 // len(species)}%)")


if __name__ == "__main__":
    main()
