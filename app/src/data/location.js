// GPS position of a find. Works offline: the GPS doesn't need internet.

// Asks for the position; resolves to null if denied or too slow
export function getPosition(timeout = 10000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    )
  })
}

// Threatened species: keep only a ~10 km square, so the album can never lead
// anyone to a nest or a rare plant (see SAFETY.md)
export function protectPosition(position, species) {
  if (!position || !species.safety.hide_location) return position
  return {
    lat: Math.round(position.lat * 10) / 10,
    lon: Math.round(position.lon * 10) / 10,
    accuracy: 10000,
    hidden: true,
  }
}
