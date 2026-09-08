export interface ImprintMethod {
  id: number;
  name: string;
  visual_effect: 'standard' | 'laser_engrave' | 'deboss' | 'full_color' | 'foil_stamp';
  supports_color: boolean;
}

export interface Product {
  id: number;
  name: string;
  shape_type: string;
  family_key?: string | null;
  family_name?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url: string;
  back_image_url?: string;
  left_image_url?: string;
  right_image_url?: string;
  top_image_url?: string;
  model_3d_url?: string | null;
  material?: string | null;
  client_slug?: string | null;
  external_product_url?: string | null;
  external_product_id?: string | null;
  embed_token?: string | null;
  tripo_job_id?: string | null;
  tripo_model_url?: string | null;
  tripo_status?: string | null;
  imprint_methods?: ImprintMethod[];
  color_variants?: ProductColorVariant[];
}

export interface ProductColorVariant {
  id?: number;
  name: string;
  hex_code?: string | null;
  image_url?: string | null;
  back_image_url?: string | null;
  left_image_url?: string | null;
  right_image_url?: string | null;
  top_image_url?: string | null;
}

export interface Client {
  id: number;
  name: string;
  slug: string;
  primary_color?: string | null;
  logo_url?: string | null;
  is_active?: boolean;
}

export interface DesignZone {
  id: number;
  /** The physical side this zone lives on: 'front', 'back', 'left', 'right', or 'top'. */
  side: string;
  /** Optional human-readable view name, e.g. "Left Chest". Falls back to `side` if empty. */
  name?: string;
  zone_type: string;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  angle: number;
  actual_width?: number;
  actual_height?: number;
  source?: '2d' | '3d';
  point3d?: [number, number, number];
  normal3d?: [number, number, number];
  size3d?: [number, number, number];
}

export type SideKey = string;

/** The 5 physical sides — used as a stable fallback when iterating 3D faces. */
export const ALL_SIDES: SideKey[] = ['front', 'back', 'left', 'right', 'top'];


/** Internal zone shape used on the Setup page before saving to the API. */
export interface SetupZone {
  side: string;
  /** Human-readable label, e.g. "Left Chest". */
  name?: string;
  type: 'logo' | 'text' | 'combined';
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  source?: '2d' | '3d';
  actual_width?: number;
  actual_height?: number;
  point3d?: [number, number, number];
  normal3d?: [number, number, number];
  size3d?: [number, number, number];
}
