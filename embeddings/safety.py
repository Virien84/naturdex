"""Add safety information to the regional species list.

Run after species_list.py. For every species it works out:
  - protected:  listed by Spain (LESRPE/CEEA) or by the Asturian catalogue
  - threatened: "EN"/"VU" in those lists, or VU/EN/CR on the IUCN Red List
                -> the app hides where it was photographed (hide_location),
                also for the species in safety/sensitive.csv
  - hazard:     why a child should keep away (curated in safety/dangerous.csv)
  - warning:    the short message the app shows

Dangerous species recorded in the region but missing from the list are added,
because the classifier can only warn about species it knows.

Usage:
    uv run python safety.py                      # Asturias (default)
    uv run python safety.py --name asturias --gadm ESP.17_1
"""

import argparse
import csv
import io
import json
import re

import openpyxl
import pypdf
import requests

from species_list import CACHE, HERE, describe, get

# Spain: "Listado de Especies Silvestres en Régimen de Protección Especial" and
# "Catálogo Español de Especies Amenazadas" (MITECO, updated 30 June 2025)
NATIONAL_URL = (
    "https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/conservacion-de-especies/"
    "esp-prot-especial/TablaLESRPE-CEEA-30062025_v2.xlsx"
)
# Asturias: 2017 draft decree for the new regional list and catalogue (Annex I).
# The catalogues in force (Decrees 32/1990 and 65/1995) are not available as text.
REGIONAL_URL = "https://ocw.uniovi.es/mod/resource/view.php?id=312"

# Kid-facing messages. "danger" = must stay away, "caution" = take care.
HAZARDS = {
    "venomous": ("danger", "Venomous snake! Stay at least two big steps away and tell your teacher. Never try to catch it."),
    "hornet": ("danger", "Hornet! It can sting several times. Move away slowly and stay far from its nest."),
    "deadly_plant": ("danger", "Very poisonous plant! Don't touch it, and never put any part of it in your mouth."),
    "deadly_fungus": ("danger", "Deadly poisonous mushroom! Don't touch it. Never eat wild mushrooms."),
    "irritating_hairs": ("danger", "Don't touch! Its hairs cause a painful, itchy rash. Keep away from its nests too."),
    "phototoxic": ("danger", "Don't touch! Its sap plus sunlight can cause bad burns."),
    "stings": ("caution", "It can sting. Stay calm, move away slowly and don't swat at it."),
    "tick": ("caution", "Ticks can carry diseases. Check your legs and clothes after the trip."),
    "toxic_skin": ("caution", "Don't touch: its skin has toxins. Wash your hands if you did."),
    "toxic_plant": ("caution", "Poisonous plant. Never put any part of it in your mouth."),
    "irritant_sap": ("caution", "Its sap can irritate your skin and eyes. Don't pick it."),
    "stinging_plant": ("caution", "Stinging hairs! Touching it gives you an itchy rash."),
    # Defaults by group, used when the species has no hazard of its own
    "fungus": ("caution", "Look, don't touch! Never eat wild mushrooms: some are deadly."),
    "amphibian": ("caution", "Don't touch: your hands can hurt its delicate skin."),
    # Every snake gets the danger message: children (and the model, see SAFETY.md) can mistake
    # a venomous Baskian viper for a harmless viperine snake
    "snake": ("danger", "Snake! Stay at least two big steps away and tell your teacher. Some snakes here are venomous."),
}
PROTECTED_WARNING = "Protected species: look, but don't touch or disturb it."
SNAKE_FAMILIES = {"Colubridae", "Natricidae", "Viperidae"}


def binomial(name):
    """'Calotriton (Euproctus) asper (Dugès, 1852)' -> 'Calotriton asper'."""
    words = re.sub(r"\(.*?\)", " ", name or "").split()
    return " ".join(words[:2]) if len(words) >= 2 and words[1].islower() else None


def download(url, file):
    path = CACHE / file
    if not path.exists():
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=120)
        response.raise_for_status()
        path.write_bytes(response.content)
    return path


RANK = {"LESRPE": 0, "VU": 1, "EN": 2}


def strongest(result, name, status):
    """Keep the most serious status when a species appears in several rows."""
    if RANK[status] > RANK.get(result.get(name), -1):
        result[name] = status


def applies_here(population):
    """Rows limited to populations elsewhere ('Canarias', 'Sur del Duero'...) don't count."""
    if not population:
        return True
    return "Península" in population or population.strip().startswith("Excepto") or "eproductora" in population


def national_list():
    """Binomial -> 'LESRPE' | 'VU' | 'EN' from the MITECO spreadsheet."""
    sheet = openpyxl.load_workbook(download(NATIONAL_URL, "lesrpe_ceea.xlsx"), read_only=True)["Normativa Especies"]
    result = {}
    for row in sheet.iter_rows(min_row=2, values_only=True):
        old_name, new_name, rank, population = row[2], row[3], row[4], row[6]
        if not applies_here(population):
            continue
        category = (row[7] or "").strip().lower()
        status = "EN" if category.startswith("en peligro") else "VU" if category.startswith("vulnerable") else "LESRPE"
        if rank != "especie":
            # A subspecies' category (often a Canary Islands one) says nothing about the species here
            status = "LESRPE"
        for name in {binomial(old_name), binomial(new_name)} - {None}:
            strongest(result, name, status)
    return result


def regional_list(names):
    """Binomial -> 'LESRPE' | 'VU' | 'EN' for our species found in Annex I of the Asturian draft."""
    text = "\n".join(page.extract_text() or "" for page in pypdf.PdfReader(download(REGIONAL_URL, "asturias_draft.pdf")).pages)
    annex = text[text.index("ANEXO I \n") : text.index("ANEXO II")]
    lines = [re.sub(r"\s+", " ", line).strip() for line in annex.splitlines()]
    new_taxon = re.compile(r"^[A-Z][a-z]+ [a-z]{3,}\b")
    result = {}
    for name in names:
        hit = next((i for i, line in enumerate(lines) if re.search(rf"\b{re.escape(name)}\b", line)), None)
        if hit is None:
            continue
        # The category may be on the same line or a few lines below, before the next taxon
        block = [lines[hit]]
        for line in lines[hit + 1 : hit + 4]:
            if new_taxon.match(line) or line.endswith(("aceae", "idae")):
                break
            block.append(line)
        block = " ".join(block)
        if "subsp." in block or "var." in block:
            result[name] = "LESRPE"  # only a subspecies is listed, same rule as national_list()
        else:
            result[name] = "EN" if "En peligro" in block else "VU" if "Vulnerable" in block else "LESRPE"
    return result


def curated_hazards():
    """Species or genus ('Euphorbia *') -> (hazard, source) from safety/dangerous.csv."""
    with open(HERE / "safety" / "dangerous.csv", encoding="utf-8") as file:
        return {row["scientific"]: (row["hazard"], row["source"]) for row in csv.DictReader(file)}


def sensitive_species():
    """Species whose location is hidden for other reasons (safety/sensitive.csv)."""
    with open(HERE / "safety" / "sensitive.csv", encoding="utf-8") as file:
        return {row["scientific"] for row in csv.DictReader(file)}


def group_of(taxonomy):
    """Group for a species added by this script (same labels as species_list.GROUPS)."""
    for rank, group in [("kingdom", {"Plantae": "plants", "Fungi": "fungi"}),
                        ("class", {"Insecta": "insects", "Arachnida": "arachnids", "Aves": "birds",
                                   "Mammalia": "mammals", "Amphibia": "amphibians", "Squamata": "reptiles",
                                   "Gastropoda": "snails and slugs"})]:
        if taxonomy[rank] in group:
            return group[taxonomy[rank]]
    return "other"


def add_missing_dangerous(species, hazards, gadm):
    """Add curated dangerous species recorded at least once in the region."""
    known = {s["scientific"] for s in species}
    for name in hazards:
        if name.endswith("*") or name in known:
            continue
        match = get("species/match", name=name)
        if match.get("rank") != "SPECIES":
            print(f"  ! {name}: not found in GBIF")
            continue
        records = get("occurrence/search", gadmGid=gadm, taxonKey=match["usageKey"], limit=0)["count"]
        if records == 0:
            print(f"  - {name}: never recorded in the region, skipped")
            continue
        new = describe(match["usageKey"])
        new.update(group=group_of(new["taxonomy"]), observations=records, added_for_safety=True)
        species.append(new)
        print(f"  + {name}: added ({records} records)")


def safety_of(s, national, regional, hazards, sensitive):
    name, taxonomy = s["scientific"], s["taxonomy"]
    statuses = [x for x in (national.get(name), regional.get(name)) if x]
    threatened = next((c for c in ("EN", "VU") if c in statuses), None)
    if s.get("iucn") in ("VU", "EN", "CR") and not threatened:
        threatened = "IUCN-" + s["iucn"]

    hazard, source = hazards.get(name) or hazards.get(f"{taxonomy['genus']} *") or (None, None)
    if not hazard and taxonomy["kingdom"] == "Fungi" and s["kind"] != "lichen":
        hazard = "fungus"
    elif not hazard and taxonomy["class"] == "Amphibia":
        hazard = "amphibian"
    elif not hazard and taxonomy["family"] in SNAKE_FAMILIES:
        hazard = "snake"

    level, warning = HAZARDS[hazard] if hazard else (None, None)
    if statuses and not warning:
        warning = PROTECTED_WARNING
    return {
        "protected": bool(statuses),
        "status": {"spain": national.get(name), "asturias": regional.get(name)},
        "threatened": threatened,
        "hide_location": threatened is not None or name in sensitive,
        "hazard": hazard,
        "level": level,
        "warning": warning,
        "source": source,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", default="asturias", help="name used by species_list.py")
    parser.add_argument("--gadm", default="ESP.17_1", help="GADM id of the region (default: Asturias)")
    args = parser.parse_args()

    path = HERE / "data" / f"{args.name}_species.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    species = data["species"]
    hazards = curated_hazards()

    print("Dangerous species missing from the list:")
    add_missing_dangerous(species, hazards, args.gadm)

    national = national_list()
    regional = regional_list({s["scientific"] for s in species})
    sensitive = sensitive_species()
    for s in species:
        s["safety"] = safety_of(s, national, regional, hazards, sensitive)

    data["safety_sources"] = {
        "spain": NATIONAL_URL,
        "asturias": REGIONAL_URL + " (2017 draft, Annex I)",
        "hazards": "safety/dangerous.csv",
        "sensitive": "safety/sensitive.csv",
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    count = lambda test: sum(1 for s in species if test(s["safety"]))
    print(f"\n{len(species)} species")
    print(f"  protected (Spain or Asturias): {count(lambda x: x['protected'])}")
    print(f"  threatened, location hidden:   {count(lambda x: x['hide_location'])}")
    print(f"  danger:                        {count(lambda x: x['level'] == 'danger')}")
    print(f"  caution:                       {count(lambda x: x['level'] == 'caution')}")


if __name__ == "__main__":
    main()
