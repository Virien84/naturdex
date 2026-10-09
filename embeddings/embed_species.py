"""Precompute BioCLIP text embeddings for the regional species list.

Run after safety.py. The phone never runs BioCLIP's text encoder: it only
compares the embedding of a photo with these precomputed ones.

Writes, into ../app/public/species/:
  - species.json            one entry per species (names, kind, safety...) + model info
  - species-embeddings.bin  float32 matrix [species x 512], same order as species.json

Usage:
    uv run python embed_species.py                  # Asturias (default)
    uv run python embed_species.py --name asturias
    uv run python embed_species.py --metadata-only  # only rewrite species.json (e.g. after
                                                    # editing safety rules), keep the embeddings
"""

import argparse
import json

import numpy as np
import open_clip
import torch
import torch.nn.functional as F

from species_list import HERE

MODEL_DIR = HERE / "models" / "bioclip"
OUTPUT_DIR = HERE.parent / "app" / "public" / "species"

# Photo-like prompts from BioCLIP's zero-shot example (models/bioclip/examples/zero_shot.py).
# Drawings, tattoos, origami... are left out: children take real photos.
TEMPLATES = [
    "a photo of a {}.",
    "a photo of the {}.",
    "a bad photo of a {}.",
    "a blurry photo of a {}.",
    "a low resolution photo of a {}.",
    "a dark photo of the {}.",
    "a bright photo of a {}.",
    "a cropped photo of a {}.",
    "a close-up photo of a {}.",
    "a photo of the hard to see {}.",
    "a photo of one {}.",
    "a photo of many {}.",
    "a good photo of the {}.",
    "a photo of a small {}.",
    "a photo of a large {}.",
]


def label(species):
    """BioCLIP's best text format: full taxonomy + common name.

    'Animalia Chordata Aves Passeriformes Muscicapidae Erithacus rubecula with common name European Robin'
    """
    taxonomy = [species["taxonomy"][rank] for rank in ("kingdom", "phylum", "class", "order", "family")]
    text = " ".join([t for t in taxonomy if t] + [species["scientific"]])
    return f"{text} with common name {species['en']}" if species["en"] else text


@torch.no_grad()
def embed_texts(model, tokenizer, labels, batch_size=64):
    """One normalized embedding per label, averaged over all the templates."""
    result = []
    for start in range(0, len(labels), batch_size):
        batch = labels[start : start + batch_size]
        sentences = [template.format(l) for l in batch for template in TEMPLATES]
        vectors = F.normalize(model.encode_text(tokenizer(sentences)), dim=-1)
        vectors = vectors.view(len(batch), len(TEMPLATES), -1).mean(dim=1)
        result.append(F.normalize(vectors, dim=-1))
        print(f"  {min(start + batch_size, len(labels))}/{len(labels)}", end="\r")
    print()
    return torch.cat(result).numpy().astype(np.float32)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", default="asturias", help="name used by species_list.py")
    parser.add_argument("--metadata-only", action="store_true", help="don't recompute the embeddings")
    args = parser.parse_args()

    data = json.loads((HERE / "data" / f"{args.name}_species.json").read_text(encoding="utf-8"))
    species = data["species"]
    if "safety" not in species[0]:
        raise SystemExit("Run safety.py first.")

    model, _, preprocess = open_clip.create_model_and_transforms(f"local-dir:{MODEL_DIR}")
    tokenizer = open_clip.get_tokenizer(f"local-dir:{MODEL_DIR}")
    model.eval()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.metadata_only:
        old = json.loads((OUTPUT_DIR / "species.json").read_text(encoding="utf-8"))["species"]
        if [s["key"] for s in old] != [s["key"] for s in species]:
            raise SystemExit("The species list changed: run without --metadata-only.")
        embeddings = np.fromfile(OUTPUT_DIR / "species-embeddings.bin", dtype=np.float32).reshape(len(species), -1)
    else:
        print(f"Embedding {len(species)} species x {len(TEMPLATES)} prompts...")
        embeddings = embed_texts(model, tokenizer, [label(s) for s in species])
        embeddings.tofile(OUTPUT_DIR / "species-embeddings.bin")  # little-endian float32

    config = json.loads((MODEL_DIR / "open_clip_config.json").read_text(encoding="utf-8"))
    app_species = [
        {k: s.get(k) for k in ("key", "scientific", "en", "kind", "group", "iucn", "taxonomy", "safety")}
        for s in species
    ]
    (OUTPUT_DIR / "species.json").write_text(
        json.dumps(
            {
                "region": data["region"],
                "source": data["source"],
                "safety_sources": data["safety_sources"],
                "model": {
                    "name": "BioCLIP (imageomics/bioclip)",
                    "embedding_size": int(embeddings.shape[1]),
                    "logit_scale": round(model.logit_scale.exp().item(), 4),
                    "image_size": config["model_cfg"]["vision_cfg"]["image_size"],
                    "mean": config["preprocess_cfg"]["mean"],
                    "std": config["preprocess_cfg"]["std"],
                },
                "embeddings_file": "species-embeddings.bin",
                "species": app_species,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"Saved {embeddings.shape[0]} x {embeddings.shape[1]} embeddings to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
