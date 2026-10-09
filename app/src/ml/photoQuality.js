// Photo quality: catches blurry or too dark photos before running the model.
//
// Blur = variance of the Laplacian: an image with few sharp edges has a low
// variance. Measured with 232 test photos shrunk to 256 px wide: sharp photos
// score ~280 or more (5th percentile), slightly blurred ones ~50, very blurred ~5.
// A threshold of 100 flags 1% of sharp photos and 76-100% of blurred ones.
export const BLUR_THRESHOLD = 100
export const DARK_THRESHOLD = 40 // mean brightness, 0-255

const WIDTH = 256

export function checkPhoto(image) {
  const height = Math.round((WIDTH * image.height) / image.width)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, WIDTH, height)
  const { data } = context.getImageData(0, 0, WIDTH, height)

  // Grayscale (same weights as Pillow's convert('L'))
  const gray = new Float32Array(WIDTH * height)
  let brightness = 0
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    brightness += gray[i]
  }
  brightness /= gray.length

  // Laplacian: 4 x pixel - its 4 neighbours, then the variance of the result
  let sum = 0
  let sumSquares = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const i = y * WIDTH + x
      const value = gray[i - WIDTH] + gray[i + WIDTH] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      sum += value
      sumSquares += value * value
      count++
    }
  }
  const sharpness = sumSquares / count - (sum / count) ** 2

  return {
    sharpness,
    brightness,
    blurry: sharpness < BLUR_THRESHOLD,
    dark: brightness < DARK_THRESHOLD,
  }
}
