import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

import type { Geofence, RouteLine, TrackingPoint } from "../types";

const colors = ["#19a7a8", "#f18f01", "#2f7dcb", "#e4572e", "#7a9e7e"];

L.Marker.prototype.options.icon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  routes: RouteLine[];
  geofences: Geofence[];
  trackingPoints?: TrackingPoint[];
};

function trackingColor(status: string): string {
  if (status === "entregado") {
    return "#4d9078";
  }
  if (status === "salida_hub") {
    return "#2f7dcb";
  }
  return "#f18f01";
}

export default function RouteMap({ routes, geofences, trackingPoints = [] }: Props) {
  const fallbackCenter: [number, number] = [14.6349, -90.5069];
  const center: [number, number] = geofences.length
    ? [geofences[0].center.lat, geofences[0].center.lng]
    : fallbackCenter;

  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: 360, width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {geofences.map((geofence) => (
        <Circle
          key={geofence.name}
          center={[geofence.center.lat, geofence.center.lng]}
          radius={geofence.radius_m}
          pathOptions={{ color: "#1f6f78", fillColor: "#1f6f78", fillOpacity: 0.08 }}
        >
          <Popup>{geofence.name}</Popup>
        </Circle>
      ))}

      {routes.map((route, index) => {
        const path: [number, number][] = route.points.map((point) => [point.lat, point.lng]);
        const color = colors[index % colors.length];
        return (
          <div key={route.vehicle_id}>
            <Polyline positions={path} pathOptions={{ color, weight: 4 }} />
            {route.points.map((point, markerIndex) => (
              <Marker key={`${route.vehicle_id}-${markerIndex}`} position={[point.lat, point.lng]}>
                <Popup>
                  Ruta planificada: {point.label} - Vehiculo {route.vehicle_id}
                </Popup>
              </Marker>
            ))}
          </div>
        );
      })}

      {trackingPoints.map((point, index) => (
        <CircleMarker
          key={`${point.vehicle_id}-${point.order_id ?? "hub"}-${index}`}
          center={[point.lat, point.lng]}
          radius={6}
          pathOptions={{ color: trackingColor(point.status), fillColor: trackingColor(point.status), fillOpacity: 0.75 }}
        >
          <Popup>
            Tracking: {point.label} - Vehiculo {point.vehicle_id} - Estado {point.status}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
