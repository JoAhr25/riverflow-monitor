export interface WaterLevelPayload {
  value: number | null;
  unit: string;
  status?: string;
  mock?: boolean;
  distance_m?: number | null;
  source?: string;
}

export interface FlowPayload {
  value: number | null;
  unit: string | null;
  calibrated: boolean;
  image_motion: number | null;
  image_motion_unit: string;
  motion_x: number | null;
  motion_y: number | null;
  direction_deg: number | null;
  coverage: number | null;
  method: string;
  frame_interval: number | null;
  source_fps: number | null;
  status: string;
}

export interface DebrisDetection {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DebrisPayload {
  count: number;
  tracked_total: number;
  active_tracks: number;
  detections: DebrisDetection[];
}

export interface CameraInfo {
  fps: number | null;
  source_fps: number | null;
  frames: number;
  source_type: string;
  source_label: string;
  mode_label: string;
  status: string;
}

export interface WaterEdgePayload {
  detected: boolean;
  edge_y: number | null;
  edge_y_normalized: number | null;
  confidence: number;
}

export interface LiveMeasurement {
  timestamp: string;
  water_level: WaterLevelPayload | null;
  flow: FlowPayload | null;
  debris: DebrisPayload;
  water_edge?: WaterEdgePayload;
  camera: CameraInfo;
  lidar_status?: string;
  lora?: { status: string; mock?: boolean };
  demo_mode?: boolean;
}

export interface ComponentStatus {
  status: string;
  detail: string;
  mock?: boolean;
}

export interface SystemStatus {
  system_online: boolean;
  demo_mode: boolean;
  uptime_s: number;
  timestamp: string;
  components: {
    camera: ComponentStatus;
    lidar: ComponentStatus;
    flow_processing: ComponentStatus;
    debris_ai: ComponentStatus;
    storage: ComponentStatus;
    lora: ComponentStatus;
    cloud: ComponentStatus;
  };
  source: SourceInfo | null;
  processing: { status: string; message: string };
  websocket_clients: number;
  pyorc: { available: boolean; version: string | null; note: string };
}

export interface SourceInfo {
  type: string;
  label: string;
  mode_label: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  frame_count: number | null;
  duration_s: number | null;
}

export interface AppConfig {
  demo_mode: boolean;
  camera: { resolution: number[]; fps: number; exposure: number | null; roi: number[] | null };
  flow: {
    method: string;
    frame_interval: number;
    farneback: Record<string, number>;
    piv_block: Record<string, number>;
    vector_grid: number;
    min_vector_magnitude: number;
  };
  debris: { enabled: boolean; model_path: string | null; confidence_threshold: number; classes: string[] };
  water_level: {
    lidar: {
      enabled: boolean;
      port: string | null;
      baudrate: number;
      mounting_height_m: number | null;
      datum_offset_m: number;
      mock: boolean;
    };
    camera_edge: { enabled: boolean };
  };
  communication: {
    lora: { enabled: boolean; port: string | null; baudrate: number; gateway_endpoint: string | null; mock: boolean };
  };
  overlays: { roi: boolean; flow_vectors: boolean; debris_boxes: boolean; water_edge: boolean; hud: boolean };
  storage: { log_interval_s: number };
}

export interface CalibrationData {
  camera_calibration: { status: string; camera_config_file: string; note: string; file_found?: boolean };
  gcps: { configured: boolean; count: number; points: unknown[] };
  physical_scale: { configured: boolean; m_per_px: number | null; note: string };
  crs: { configured: boolean; value: string | null };
  reference_elevation: { configured: boolean; value_m: number | null };
  cross_section: { configured: boolean; area_m2: number | null; file: string; points: unknown[] };
  flow_rate: { configured: boolean; velocity_correction_factor: number | null; note: string };
}

export interface CalibrationSummary {
  camera_calibration: string;
  camera_calibration_file_found: boolean;
  gcps: string;
  gcp_count: number;
  physical_scale: string;
  m_per_px: number | null;
  crs: string;
  reference_elevation: string | number | null;
  cross_section: string;
  cross_section_area_m2: number | null;
  flow_rate: string;
  velocity_calibrated: boolean;
  discharge_available: boolean;
}

export interface HistoryRow {
  timestamp: string;
  water_level: number | null;
  lidar_distance: number | null;
  camera_water_edge: number | null;
  flow_rate: number | null;
  surface_velocity: number | null;
  velocity_unit: string | null;
  calibrated: number;
  image_motion: number | null;
  motion_x: number | null;
  motion_y: number | null;
  direction_deg: number | null;
  debris_count: number | null;
  camera_status: string | null;
  lidar_status: string | null;
  lora_status: string | null;
  source: string | null;
  camera_fps: number | null;
}

export interface ValidationTest {
  id: number;
  timestamp: string;
  test_name: string;
  reference_flow_rate: number | null;
  measured_flow_rate: number | null;
  reference_water_level: number | null;
  measured_water_level: number | null;
  reference_debris_count: number | null;
  measured_debris_count: number | null;
  notes: string;
  flow_metrics: { error_pct: number | null; accuracy_pct: number | null };
  water_level_metrics: { error_pct: number | null; accuracy_pct: number | null };
  debris_metrics: { error_pct: number | null; accuracy_pct: number | null };
}

export interface UploadedVideoInfo {
  video_id: string;
  path: string;
  size_bytes: number;
  width: number;
  height: number;
  fps: number | null;
  frame_count: number | null;
  duration_s: number | null;
  message: string;
}

export interface WaterLevelPageData {
  primary: {
    sensor: string;
    status: string;
    mock: boolean;
    distance_m: number | null;
    water_level_m: number | null;
    unit: string;
    timestamp: number | string | null;
    mounting_height_configured: boolean;
    message: string;
  };
  camera_cue: {
    sensor: string;
    role: string;
    detected: boolean;
    edge_y_normalized: number | null;
    confidence: number;
    water_level_m: number | null;
    message: string;
  };
  fusion: { status: string; detail: string };
  reference_elevation: { configured: boolean; value_m: number | null };
}
