# NaturDex · embeddings (laptop side)

Python scripts that run **once, on the laptop**, before the field trip:

1. `species_list.py` — download the regional species list from GBIF → `data/<region>_species.json`.
   Default: Asturias (GADM `ESP.17_1`), species with ≥ 20 human observations since 2000 → 1,933 species (+ 11 dangerous ones added by `safety.py` = 1,944).
   Each species has its taxonomy, English (92%) and Spanish common names, a kid-friendly *kind* ("moth", "spider"…) and its IUCN category.
2. `safety.py` — add safety info to that file: protected status (Spain + Asturias), threatened
   species whose location is hidden, and kid-facing warnings for dangerous species
   (`safety/dangerous.csv`, `safety/sensitive.csv`). See [../SAFETY.md](../SAFETY.md).
3. `embed_species.py` — BioCLIP text embedding of every species (full taxonomy + common name,
   averaged over 15 photo prompts) → `../app/public/species/species.json` + `species-embeddings.bin`
   (float32, species × 512).
4. `export_onnx.py` — BioCLIP's image encoder to ONNX → `models/onnx/bioclip-image-fp32.onnx` (345 MB,
   reference) and `../app/public/models/bioclip-image-int8.onnx` (87 MB, int8 weights, for the phone).
5. `evaluate.py` — accuracy check on research-grade iNaturalist photos from Spain, run exactly as the
   phone will (see the latest numbers in [../SAFETY.md](../SAFETY.md) and the post).

The phone never runs PyTorch: it only uses the exported ONNX model.

```sh
uv sync                    # install dependencies (CPU-only PyTorch)
uv run python species_list.py
uv run python safety.py    # always after species_list.py (it rewrites the file)
uv run python embed_species.py
uv run python export_onnx.py
uv run python evaluate.py
```

The BioCLIP weights live in `models/bioclip/` (not committed to git).
