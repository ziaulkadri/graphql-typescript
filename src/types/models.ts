export type UserRole = 'admin' | 'operator' | 'viewer';
export type AssetStatus = 'active' | 'inactive' | 'maintenance' | 'decommissioned';
export type EventSeverity = 'info' | 'warning' | 'critical';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'closed';
export type FacilityType = 'warehouse' | 'manufacturing' | 'distribution' | 'port';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Facility {
  id: string;
  name: string;
  location: string;
  type: FacilityType;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Asset {
  id: string;
  facility_id: string;
  name: string;
  type: string;
  serial_number: string | null;
  status: AssetStatus;
  metadata: Record<string, unknown>;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SupplyChainEvent {
  id: string;
  asset_id: string;
  facility_id: string;
  type: string;
  severity: EventSeverity;
  data: Record<string, unknown>;
  source: string;
  processed: boolean;
  processed_at: Date | null;
  created_at: Date;
}

export interface AnalyticsMetric {
  id: string;
  facility_id: string | null;
  asset_id: string | null;
  metric_name: string;
  metric_value: number;
  tags: Record<string, string>;
  recorded_at: Date;
}

export interface Alert {
  id: string;
  facility_id: string | null;
  asset_id: string | null;
  event_id: string | null;
  title: string;
  description: string | null;
  severity: AlertSeverity;
  status: AlertStatus;
  assigned_to: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
}

// Input types for creation/update
export interface CreateFacilityInput {
  name: string;
  location: string;
  type: FacilityType;
  metadata?: Record<string, unknown>;
}

export interface UpdateFacilityInput {
  name?: string;
  location?: string;
  type?: FacilityType;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export interface CreateAssetInput {
  facility_id: string;
  name: string;
  type: string;
  serial_number?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAssetInput {
  name?: string;
  type?: string;
  status?: AssetStatus;
  metadata?: Record<string, unknown>;
}

export interface CreateEventInput {
  asset_id: string;
  facility_id: string;
  type: string;
  severity: EventSeverity;
  data: Record<string, unknown>;
  source: string;
}

export interface CreateAlertInput {
  facility_id?: string;
  asset_id?: string;
  event_id?: string;
  title: string;
  description?: string;
  severity: AlertSeverity;
}

export interface UpdateAlertInput {
  status?: AlertStatus;
  assigned_to?: string;
  description?: string;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
