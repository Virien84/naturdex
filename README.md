# NaturDex

A nature "Pokémon Snap" for school field trips: photograph plants and animals and fill your NaturDex, **fully offline** on recycled phones.

**Try it:** https://virien84.github.io/naturdex/ (open it on a phone, tap *Prepare trip* on wifi, then go outside).

- `app/` — the PWA (React + Vite + vite-plugin-pwa + onnxruntime-web).
- `embeddings/` — Python scripts (uv) that prepare the model and the species list on a laptop.
- [`SAFETY.md`](SAFETY.md) — how NaturDex keeps kids and protected species safe.

## How it is hosted

| What | Where |
|---|---|
| The app | GitHub Pages, rebuilt on every push to `main` by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) |
| The BioCLIP model (87 MB, too big for GitHub) | Hugging Face: [Virien/naturdex-bioclip-onnx](https://huggingface.co/Virien/naturdex-bioclip-onnx) |
| Species list + embeddings (~5 MB) | In this repo, `app/public/species/` |

Everything runs on the phone: photos and locations never leave it.

## Credits

- [BioCLIP](https://huggingface.co/imageomics/bioclip) by the Imageomics Institute (MIT).
- Species occurrences from [GBIF](https://www.gbif.org/); test photos from [iNaturalist](https://www.inaturalist.org/).
