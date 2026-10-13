import type { LatLng } from '@velio/contracts';
import { Icon, useTheme } from '@velio/ui/native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';

export interface OrderMapProps {
  destination: LatLng | null;
  provider?: (LatLng & { headingDeg?: number | null }) | null;
  /** Segundo destino (devolução/terceiro) em LOGISTICS. */
  secondary?: LatLng | null;
  /** Mostra só um círculo aproximado (oferta ao prestador: sem endereço exato). */
  approxRadiusM?: number;
  follow?: boolean;
  height?: number;
  /** Resumo textual para leitor de tela (ETA, distância). */
  accessibilitySummary?: string;
}

/** Mapa nativo (Apple Maps/Google Maps) com pino do endereço, marcador do prestador e rota reta. */
export function OrderMap({
  destination,
  provider,
  secondary,
  approxRadiusM,
  follow = true,
  height = 260,
  accessibilitySummary,
}: OrderMapProps) {
  const { colors } = useTheme();
  const ref = useRef<MapView>(null);
  const center = destination ?? provider ?? { lat: -23.5505, lng: -46.6333 };

  useEffect(() => {
    if (!ref.current || !follow) return;
    const points = [destination, provider, secondary].filter((p): p is LatLng => Boolean(p));
    if (points.length >= 2) {
      ref.current.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 60, bottom: 60, left: 60, right: 60 }, animated: true },
      );
    } else if (points[0]) {
      ref.current.animateToRegion(
        {
          latitude: points[0].lat,
          longitude: points[0].lng,
          latitudeDelta: approxRadiusM ? 0.02 : 0.01,
          longitudeDelta: approxRadiusM ? 0.02 : 0.01,
        },
        480,
      );
    }
  }, [destination, provider, secondary, follow, approxRadiusM]);

  return (
    <View style={{ height }} accessibilityLabel={accessibilitySummary ?? 'Mapa do pedido'}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        userInterfaceStyle={undefined}
      >
        {approxRadiusM && destination ? (
          <Circle
            center={{ latitude: destination.lat, longitude: destination.lng }}
            radius={approxRadiusM}
            fillColor={`${colors.primary}33`}
            strokeColor={colors.primary}
            strokeWidth={1.5}
          />
        ) : destination ? (
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            accessibilityLabel="Endereço do serviço"
          >
            <Icon name="map-pin" size={32} color={colors.text} />
          </Marker>
        ) : null}
        {secondary ? (
          <Marker
            coordinate={{ latitude: secondary.lat, longitude: secondary.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            accessibilityLabel="Destino"
          >
            <Icon name="flag" size={28} color={colors.textMuted} />
          </Marker>
        ) : null}
        {provider ? (
          <Marker
            coordinate={{ latitude: provider.lat, longitude: provider.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={provider.headingDeg ?? 0}
            flat
            accessibilityLabel="Profissional"
          >
            <View
              style={[
                styles.providerMarker,
                { backgroundColor: colors.primary, borderColor: colors.surface },
              ]}
            >
              <Icon name="navigation" size={18} color={colors.textOnPrimary} />
            </View>
          </Marker>
        ) : null}
        {provider && destination && !approxRadiusM ? (
          <Polyline
            coordinates={[
              { latitude: provider.lat, longitude: provider.lng },
              { latitude: destination.lat, longitude: destination.lng },
            ]}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineDashPattern={[8, 8]}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  providerMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
