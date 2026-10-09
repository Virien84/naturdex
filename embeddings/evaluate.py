"""Check how well the exported model identifies real photos.

Downloads research-grade iNaturalist photos taken in Spain of some species in
the list (the most observed of each group, plus the dangerous ones), runs them
through the ONNX models exactly as the phone will, and reports top-1/3/5 accuracy.

Photos are only used for this local test (cache/test_photos, not committed).

Usage:
    uv run python evaluate.py                     # 4 species per group, 2 photos each
    uv run python evaluate.py --per-group 8 --photos 3
"""

import argparse
import io
import json
import time
from collections import defaultdict

import numpy as np
import onnxruntime as ort
import requests
from PIL import Image

from species_list import CACHE, HERE

SPECIES_DIR = HERE.parent / "app" / "public" / "species"
MODELS = {
    "fp32": HERE / "models" / "onnx" / "bioclip-image-fp32.onnx",
    "int8": HERE.parent / "app" / "public" / "models" / "bioclip-image-int8.onnx",
}
PHOTOS = CACHE.parent / "test_photos"
SPAIN = 6774  # iNaturalist place id
PRECAUTION = 0.05  # a top-5 candidate this likely triggers its safety warning


def preprocess(image, size, mean, std):
    """Same steps as open_clip: resize the short side, center crop, normalize."""
    image = image.convert("RGB")
    scale = size / min(image.size)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.BICUBIC)
    left, top = (image.width - size) // 2, (image.height - size) // 2
    image = image.crop((left, top, left + size, top + size))
    pixels = (np.asarray(image, dtype=np.float32) / 255 - mean) / std
    return pixels.transpose(2, 0, 1)[None].astype(np.float32)


def test_photos(name, count):
    """Download (once) up to `count` research-grade photos of a species."""
    folder = PHOTOS / name.replace(" ", "_")
    folder.mkdir(parents=True, exist_ok=True)
    existing = sorted(folder.glob("*.jpg"))
    if len(existing) >= count:
        return existing[:count]
    response = requests.get(
        "https://api.inaturalist.org/v1/observations",
        params={"taxon_name": name, "quality_grade": "research", "photos": "true",
                "place_id": SPAIN, "per_page": count, "order_by": "observed_on"},  # most voted = oddities (albino blackbirds)
        timeout=60,
    )
    response.raise_for_status()
    for observation in response.json()["results"]:
        url = observation["photos"][0]["url"].replace("square", "medium")
        path = folder / f"{observation['id']}.jpg"
        if not path.exists():
            Image.open(io.BytesIO(requests.get(url, timeout=60).content)).convert("RGB").save(path)
        time.sleep(1)  # be polite with iNaturalist's API
    return sorted(folder.glob("*.jpg"))[:count]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--per-group", type=int, default=4, help="most observed species per group")
    parser.add_argument("--photos", type=int, default=2, help="photos per species")
    args = parser.parse_args()

    meta = json.loads((SPECIES_DIR / "species.json").read_text(encoding="utf-8"))
    species = meta["species"]
    model = meta["model"]
    embeddings = np.fromfile(SPECIES_DIR / meta["embeddings_file"], dtype=np.float32).reshape(len(species), -1)
    mean, std = np.array(model["mean"], np.float32), np.array(model["std"], np.float32)

    # Species are sorted by group and observations in species_list.py
    by_group = defaultdict(list)
    for index, s in enumerate(species):
        by_group[s["group"]].append(index)
    chosen = {i for indices in by_group.values() for i in indices[: args.per_group]}
    chosen |= {i for i, s in enumerate(species) if s["safety"]["level"] == "danger"}

    print(f"Downloading test photos for {len(chosen)} species...")
    tests = [(i, path) for i in sorted(chosen) for path in test_photos(species[i]["scientific"], args.photos)]
    print(f"{len(tests)} photos")

    for label, path in MODELS.items():
        session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        hits = defaultdict(int)
        misses = []
        risky, warned = 0, 0
        start = time.perf_counter()
        for truth, photo in tests:
            vector = session.run(None, {"pixels": preprocess(Image.open(photo), model["image_size"], mean, std)})[0][0]
            logits = model["logit_scale"] * (embeddings @ vector)
            probabilities = np.exp(logits - logits.max())
            probabilities /= probabilities.sum()
            ranking = np.argsort(-probabilities)
            position = int(np.where(ranking == truth)[0][0])
            for k in (1, 3, 5):
                hits[k] += position < k
            if position > 0:
                misses.append((species[truth]["scientific"], species[ranking[0]]["scientific"], position + 1))
            # Precaution rule (the app does the same): warn if any likely candidate has a hazard
            if species[truth]["safety"]["level"]:
                risky += 1
                warned += any(species[i]["safety"]["level"] and probabilities[i] >= PRECAUTION
                              for i in ranking[:5])
        seconds = (time.perf_counter() - start) / len(tests)
        print(f"\n{label}: top-1 {hits[1] / len(tests):.0%} · top-3 {hits[3] / len(tests):.0%} · "
              f"top-5 {hits[5] / len(tests):.0%} · {seconds * 1000:.0f} ms/photo on this PC")
        print(f"   photos of species with a hazard that get a warning: {warned}/{risky}")
        for real, guess, position in misses:
            print(f"   {real:28} -> {guess:28} (right answer at #{position})")


if __name__ == "__main__":
    main()
