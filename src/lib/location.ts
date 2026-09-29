import * as Location from 'expo-location';

export type LatLng = { lat: number; lng: number };

/**
 * The backend requires { lat, lng } on lead create, update, note and every lead action.
 * Throws a readable error if permission is denied or GPS is off.
 */
export async function getLocation(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is needed to save this. Allow it in Settings and try again.');
  }
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    throw new Error('Could not get your location. Turn on GPS and try again.');
  }
}
