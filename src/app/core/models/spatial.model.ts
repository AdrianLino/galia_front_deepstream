export type SpatialNodeTipo = 'EXTERIOR' | 'EDIFICIO' | 'PISO' | 'ZONA_INTERNA';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SpatialNode {
  id: string;
  parent_id?: string;
  name: string;
  tipo: SpatialNodeTipo;
  descripcion?: string;
  geo_poligono?: GeoPoint[];
  plano_url?: string;
  plano_bounds?: [[number, number], [number, number]];
  centro_lat?: number;
  centro_lng?: number;
  zoom_nivel?: number;
  piso?: number;
  orden: number;
  children_count: number;
  cameras_count: number;
  created_at: string;
  updated_at: string;
}

export interface SpatialNodeWithBreadcrumb extends SpatialNode {
  breadcrumb: SpatialNode[];
}

export interface SpatialNodeCreate {
  name: string;
  tipo: SpatialNodeTipo;
  parent_id?: string;
  descripcion?: string;
  geo_poligono?: GeoPoint[];
  plano_url?: string;
  plano_bounds?: [[number, number], [number, number]];
  centro_lat?: number;
  centro_lng?: number;
  zoom_nivel?: number;
  piso?: number;
  orden?: number;
}

export interface SpatialNodeUpdate {
  name?: string;
  tipo?: SpatialNodeTipo;
  parent_id?: string;
  descripcion?: string;
  geo_poligono?: GeoPoint[];
  plano_url?: string;
  plano_bounds?: [[number, number], [number, number]];
  centro_lat?: number;
  centro_lng?: number;
  zoom_nivel?: number;
  piso?: number;
  orden?: number;
}

export interface CameraAssignment {
  source_id: string;
  node_id?: string;
}
