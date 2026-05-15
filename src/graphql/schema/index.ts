import { gql } from 'graphql-tag';

export const typeDefs = gql`
  scalar DateTime
  scalar JSON

  # ─── Enums ────────────────────────────────────────────────────────────────────
  enum UserRole { admin operator viewer }
  enum AssetStatus { active inactive maintenance decommissioned }
  enum EventSeverity { info warning critical }
  enum AlertSeverity { low medium high critical }
  enum AlertStatus { open acknowledged resolved closed }
  enum FacilityType { warehouse manufacturing distribution port }

  # ─── Pagination ───────────────────────────────────────────────────────────────
  input PaginationInput {
    limit: Int
    offset: Int
  }

  type PageInfo {
    total: Int!
    limit: Int!
    offset: Int!
    hasMore: Boolean!
  }

  # ─── User ─────────────────────────────────────────────────────────────────────
  type User {
    id: ID!
    email: String!
    name: String!
    role: UserRole!
    isActive: Boolean!
    lastLoginAt: DateTime
    createdAt: DateTime!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type TokenPair {
    accessToken: String!
    refreshToken: String!
  }

  input RegisterInput {
    email: String!
    password: String!
    name: String!
    role: UserRole
  }

  input LoginInput {
    email: String!
    password: String!
  }

  # ─── Facility ─────────────────────────────────────────────────────────────────
  type Facility {
    id: ID!
    name: String!
    location: String!
    type: FacilityType!
    metadata: JSON!
    isActive: Boolean!
    assets(pagination: PaginationInput): AssetPage!
    openAlerts: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type FacilityPage {
    items: [Facility!]!
    pageInfo: PageInfo!
  }

  input CreateFacilityInput {
    name: String!
    location: String!
    type: FacilityType!
    metadata: JSON
  }

  input UpdateFacilityInput {
    name: String
    location: String
    type: FacilityType
    metadata: JSON
    isActive: Boolean
  }

  # ─── Asset ────────────────────────────────────────────────────────────────────
  type Asset {
    id: ID!
    facilityId: ID!
    facility: Facility!
    name: String!
    type: String!
    serialNumber: String
    status: AssetStatus!
    metadata: JSON!
    lastSeenAt: DateTime
    latestMetrics: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AssetPage {
    items: [Asset!]!
    pageInfo: PageInfo!
  }

  input CreateAssetInput {
    facilityId: ID!
    name: String!
    type: String!
    serialNumber: String
    metadata: JSON
  }

  input UpdateAssetInput {
    name: String
    type: String
    status: AssetStatus
    metadata: JSON
  }

  input AssetFilters {
    facilityId: ID
    status: AssetStatus
    type: String
  }

  # ─── Event ────────────────────────────────────────────────────────────────────
  type Event {
    id: ID!
    assetId: ID!
    facilityId: ID!
    asset: Asset!
    facility: Facility!
    type: String!
    severity: EventSeverity!
    data: JSON!
    source: String!
    processed: Boolean!
    processedAt: DateTime
    createdAt: DateTime!
  }

  type EventPage {
    items: [Event!]!
    pageInfo: PageInfo!
  }

  type EventStats {
    info: Int!
    warning: Int!
    critical: Int!
  }

  input IngestEventInput {
    assetId: ID!
    facilityId: ID!
    type: String!
    severity: EventSeverity!
    data: JSON!
    source: String!
  }

  input EventFilters {
    facilityId: ID
    assetId: ID
    severity: EventSeverity
    processed: Boolean
  }

  # ─── Alert ────────────────────────────────────────────────────────────────────
  type Alert {
    id: ID!
    facilityId: ID
    assetId: ID
    eventId: ID
    facility: Facility
    asset: Asset
    title: String!
    description: String
    severity: AlertSeverity!
    status: AlertStatus!
    assignedTo: ID
    assignedUser: User
    resolvedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AlertPage {
    items: [Alert!]!
    pageInfo: PageInfo!
  }

  input CreateAlertInput {
    facilityId: ID
    assetId: ID
    eventId: ID
    title: String!
    description: String
    severity: AlertSeverity!
  }

  input UpdateAlertInput {
    status: AlertStatus
    assignedTo: ID
    description: String
  }

  input AlertFilters {
    status: AlertStatus
    facilityId: ID
    assignedTo: ID
  }

  # ─── Analytics ────────────────────────────────────────────────────────────────
  type TimeSeriesPoint {
    bucket: DateTime!
    avg: Float!
    min: Float!
    max: Float!
    count: Int!
  }

  type DashboardSummary {
    assetStats: JSON!
    eventStats: JSON!
    recentMetrics: JSON!
  }

  input TimeSeriesInput {
    assetId: ID
    facilityId: ID
    metricName: String!
    from: DateTime!
    to: DateTime!
    interval: String
  }

  input RecordMetricsInput {
    facilityId: ID
    assetId: ID
    metricName: String!
    metricValue: Float!
    tags: JSON
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────
  type Query {
    # Auth
    me: User!

    # Facilities
    facilities(pagination: PaginationInput): FacilityPage!
    facility(id: ID!): Facility!

    # Assets
    assets(pagination: PaginationInput, filters: AssetFilters): AssetPage!
    asset(id: ID!): Asset!

    # Events
    events(pagination: PaginationInput, filters: EventFilters): EventPage!
    event(id: ID!): Event!
    eventStats(facilityId: ID!): EventStats!
    unprocessedEventCount(facilityId: ID): Int!

    # Alerts
    alerts(pagination: PaginationInput, filters: AlertFilters): AlertPage!
    alert(id: ID!): Alert!
    openCriticalAlertCount(facilityId: ID): Int!

    # Analytics
    timeSeries(input: TimeSeriesInput!): [TimeSeriesPoint!]!
    dashboardSummary(facilityId: ID!): DashboardSummary!
  }

  # ─── Mutations ────────────────────────────────────────────────────────────────
  type Mutation {
    # Auth
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    refreshTokens(refreshToken: String!): TokenPair!
    changePassword(currentPassword: String!, newPassword: String!): Boolean!

    # Facilities
    createFacility(input: CreateFacilityInput!): Facility!
    updateFacility(id: ID!, input: UpdateFacilityInput!): Facility!
    deleteFacility(id: ID!): Boolean!

    # Assets
    createAsset(input: CreateAssetInput!): Asset!
    updateAsset(id: ID!, input: UpdateAssetInput!): Asset!

    # Events
    ingestEvent(input: IngestEventInput!): Event!
    markEventProcessed(id: ID!): Event!

    # Alerts
    createAlert(input: CreateAlertInput!): Alert!
    updateAlert(id: ID!, input: UpdateAlertInput!): Alert!

    # Analytics
    recordMetrics(metrics: [RecordMetricsInput!]!): Boolean!
  }

  # ─── Subscriptions ────────────────────────────────────────────────────────────
  type Subscription {
    eventIngested(facilityId: ID, severity: EventSeverity): Event!
    alertCreated(facilityId: ID): Alert!
    criticalEvent: Event!
  }
`;
