import { Linking, Platform } from 'react-native';

/** Abre navegação externa: Waze, Google Maps ou Apple Maps. */
export async function openNavigation(
  dest: { lat: number; lng: number },
  app: 'waze' | 'google' | 'apple',
): Promise<boolean> {
  const urls: Record<typeof app, string> = {
    waze: `waze://?ll=${dest.lat},${dest.lng}&navigate=yes`,
    google:
      Platform.OS === 'ios'
        ? `comgooglemaps://?daddr=${dest.lat},${dest.lng}&directionsmode=driving`
        : `google.navigation:q=${dest.lat},${dest.lng}`,
    apple: `maps://?daddr=${dest.lat},${dest.lng}&dirflg=d`,
  };
  const fallback: Record<typeof app, string> = {
    waze: `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`,
    apple: `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}`,
  };
  try {
    const can = await Linking.canOpenURL(urls[app]);
    await Linking.openURL(can ? urls[app] : fallback[app]);
    return true;
  } catch {
    try {
      await Linking.openURL(fallback[app]);
      return true;
    } catch {
      return false;
    }
  }
}
