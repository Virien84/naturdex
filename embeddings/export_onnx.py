"""Export BioCLIP's image encoder to ONNX for the phone.

The exported model takes one preprocessed photo (1 x 3 x 224 x 224, float32,
already resized, center-cropped and normalized with the mean/std in
species.json) and returns its normalized 512-d embedding.

Writes:
  - models/onnx/bioclip-image-fp32.onnx               full precision, reference only (~340 MB)
  - ../app/public/models/bioclip-image-int8.onnx      int8 weights, shipped to the phone (~90 MB)

Usage:
    uv run python export_onnx.py
"""

import torch
import torch.nn.functional as F
import open_clip
from onnxruntime.quantization import QuantType, quantize_dynamic

from species_list import HERE

MODEL_DIR = HERE / "models" / "bioclip"
FP32 = HERE / "models" / "onnx" / "bioclip-image-fp32.onnx"
INT8 = HERE.parent / "app" / "public" / "models" / "bioclip-image-int8.onnx"


class ImageEncoder(torch.nn.Module):
    """Only the vision half of BioCLIP, plus the final normalization."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, pixels):
        return F.normalize(self.model.encode_image(pixels), dim=-1)


def main():
    model, _, _ = open_clip.create_model_and_transforms(f"local-dir:{MODEL_DIR}")
    encoder = ImageEncoder(model).eval()

    FP32.parent.mkdir(parents=True, exist_ok=True)
    print("Exporting to ONNX (fp32)...")
    torch.onnx.export(
        encoder,
        (torch.randn(1, 3, 224, 224),),
        FP32,
        input_names=["pixels"],
        output_names=["embedding"],
        opset_version=17,
        dynamo=False,  # the classic exporter gives a single, simple file
    )

    print("Quantizing weights to int8...")
    INT8.parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(FP32, INT8, weight_type=QuantType.QInt8)

    for path in (FP32, INT8):
        print(f"  {path.name}: {path.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
