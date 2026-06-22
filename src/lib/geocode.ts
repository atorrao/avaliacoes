const NOMINATIM = 'https://nominatim.openstreetmap.org'

export interface GeoResult {
  lat: number
  lon: number
  display_name: string
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const q = encodeURIComponent(`${address}, Portugal`)
  const url = `${NOMINATIM}/search?q=${q}&format=json&limit=1&countrycodes=pt`
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'pt-PT', 'User-Agent': 'AddValiador/1.0' } })
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display_name: data[0].display_name }
  } catch { return null }
}
