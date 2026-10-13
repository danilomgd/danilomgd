import type {
  AddPaymentMethodInput,
  Address,
  AddressInput,
  AuthTokens,
  CancelInput,
  CompleteInput,
  ConciergeRequest,
  ConciergeRequestInput,
  CreatePaymentIntentInput,
  CreateQuoteInput,
  CreateServiceRequestInput,
  CustodyScanInput,
  DashboardMetrics,
  DispatchOffer,
  Dispute,
  Equipment,
  EquipmentInput,
  EvidenceInput,
  HomeResponse,
  LocationBatchInput,
  ManualAssignInput,
  MediaEvidence,
  Message,
  Notification,
  OpenDisputeInput,
  OrderListQuery,
  OtpRequestInput,
  OtpVerifyInput,
  PasswordLoginInput,
  PaymentIntent,
  PaymentMethod,
  PriceEstimate,
  PriceEstimateInput,
  ProviderMe,
  ProviderOnboardingInput,
  Quote,
  Review,
  ReviewInput,
  SendMessageInput,
  Service,
  ServiceCategory,
  ServiceOrder,
  ServiceOrderDetail,
  ServiceSummary,
  SetAvailabilityInput,
  StartInput,
  SubscribeInput,
  Subscription,
  SubscriptionPlan,
  TransitionInput,
  UpdateProfileInput,
  UserPublic,
  Vehicle,
  VehicleHandoverInput,
  VehicleInput,
  WalletSummary,
} from '@velio/contracts';
import type { z } from 'zod';
import type { HttpClient } from './http';

type Infer<T> = T extends z.ZodTypeAny ? z.infer<T> : T;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Superfície tipada da API. Caminhos espelham `08_API_SPECIFICATION.md`. */
export function createApi(http: HttpClient) {
  return {
    auth: {
      requestOtp: (b: OtpRequestInput) =>
        http.post<{ challengeId: string; expiresInSeconds: number; devCode?: string }>(
          '/v1/auth/otp/request',
          b,
        ),
      verifyOtp: (b: OtpVerifyInput) => http.post<AuthTokens>('/v1/auth/otp/verify', b),
      passwordLogin: (b: PasswordLoginInput) => http.post<AuthTokens>('/v1/auth/password/login', b),
      logout: () => http.post<void>('/v1/auth/logout'),
      me: () => http.get<UserPublic>('/v1/me'),
      updateProfile: (b: UpdateProfileInput) => http.patch<UserPublic>('/v1/me', b),
      registerDevice: (b: { pushToken: string; platform: 'ios' | 'android' | 'web' }) =>
        http.post<void>('/v1/me/devices', b),
    },
    catalog: {
      home: (q?: { lat?: number; lng?: number }) => http.get<HomeResponse>('/v1/catalog/home', q),
      categories: () => http.get<ServiceCategory[]>('/v1/catalog/categories'),
      services: (q?: { category?: string }) => http.get<ServiceSummary[]>('/v1/catalog/services', q),
      service: (slug: string) => http.get<Service>(`/v1/catalog/services/${slug}`),
      search: (q: string, loc?: { lat?: number; lng?: number }) =>
        http.get<ServiceSummary[]>('/v1/catalog/search', { q, ...loc }),
      estimate: (b: Infer<typeof PriceEstimateInput>) => http.post<PriceEstimate>('/v1/catalog/estimate', b),
      plans: () => http.get<SubscriptionPlan[]>('/v1/catalog/plans'),
    },
    me: {
      addresses: () => http.get<Address[]>('/v1/me/addresses'),
      addAddress: (b: AddressInput) => http.post<Address>('/v1/me/addresses', b),
      deleteAddress: (id: string) => http.delete<void>(`/v1/me/addresses/${id}`),
      vehicles: () => http.get<Vehicle[]>('/v1/me/vehicles'),
      addVehicle: (b: VehicleInput) => http.post<Vehicle>('/v1/me/vehicles', b),
      equipments: () => http.get<Equipment[]>('/v1/me/equipments'),
      addEquipment: (b: EquipmentInput) => http.post<Equipment>('/v1/me/equipments', b),
      paymentMethods: () => http.get<PaymentMethod[]>('/v1/me/payment-methods'),
      addPaymentMethod: (b: AddPaymentMethodInput) => http.post<PaymentMethod>('/v1/me/payment-methods', b),
      notifications: () => http.get<Notification[]>('/v1/me/notifications'),
      wallet: () => http.get<WalletSummary>('/v1/me/wallet'),
      subscriptions: () => http.get<Subscription[]>('/v1/me/subscriptions'),
      subscribe: (b: Infer<typeof SubscribeInput>) => http.post<Subscription>('/v1/me/subscriptions', b),
      cancelSubscription: (id: string, reason: string) =>
        http.post<Subscription>(`/v1/me/subscriptions/${id}/cancel`, { reason }),
    },
    orders: {
      create: (b: CreateServiceRequestInput) => http.post<ServiceOrderDetail>('/v1/requests', b),
      list: (q?: Infer<typeof OrderListQuery>) => http.get<Page<ServiceOrder>>('/v1/orders', q),
      get: (id: string) => http.get<ServiceOrderDetail>(`/v1/orders/${id}`),
      transition: (id: string, b: TransitionInput) =>
        http.post<ServiceOrderDetail>(`/v1/orders/${id}/transition`, b),
      cancel: (id: string, b: Infer<typeof CancelInput>) =>
        http.post<ServiceOrderDetail>(`/v1/orders/${id}/cancel`, b),
      start: (id: string, b: Infer<typeof StartInput>) =>
        http.post<ServiceOrderDetail>(`/v1/orders/${id}/start`, b),
      complete: (id: string, b: Infer<typeof CompleteInput>) =>
        http.post<ServiceOrderDetail>(`/v1/orders/${id}/complete`, b),
      addEvidence: (id: string, b: Infer<typeof EvidenceInput>) =>
        http.post<MediaEvidence>(`/v1/orders/${id}/evidence`, b),
      custodyScan: (id: string, b: Infer<typeof CustodyScanInput>) =>
        http.post<ServiceOrderDetail>(`/v1/orders/${id}/custody/scan`, b),
      vehicleHandover: (id: string, step: 'PICKUP' | 'DELIVERY', b: Infer<typeof VehicleHandoverInput>) =>
        http.post<ServiceOrderDetail>(`/v1/orders/${id}/vehicle-handover/${step}`, b),
      createQuote: (id: string, b: CreateQuoteInput) => http.post<Quote>(`/v1/orders/${id}/quotes`, b),
      decideQuote: (quoteId: string, decision: 'APPROVE' | 'REJECT') =>
        http.post<Quote>(`/v1/quotes/${quoteId}/${decision.toLowerCase()}`),
      createPayment: (id: string, b: Infer<typeof CreatePaymentIntentInput>) =>
        http.post<PaymentIntent>(`/v1/orders/${id}/payments`, b),
      payments: (id: string) => http.get<PaymentIntent[]>(`/v1/orders/${id}/payments`),
      review: (id: string, b: ReviewInput) => http.post<Review>(`/v1/orders/${id}/review`, b),
      openDispute: (id: string, b: Infer<typeof OpenDisputeInput>) =>
        http.post<Dispute>(`/v1/orders/${id}/disputes`, b),
      messages: (id: string) => http.get<Message[]>(`/v1/orders/${id}/messages`),
      sendMessage: (id: string, b: Infer<typeof SendMessageInput>) =>
        http.post<Message>(`/v1/orders/${id}/messages`, b),
    },
    concierge: {
      create: (b: ConciergeRequestInput) => http.post<ConciergeRequest>('/v1/concierge/requests', b),
      get: (id: string) => http.get<ConciergeRequest>(`/v1/concierge/requests/${id}`),
      approvePlan: (id: string) => http.post<ServiceOrderDetail>(`/v1/concierge/requests/${id}/approve-plan`),
      answer: (id: string, answers: Array<{ question: string; answer: string }>) =>
        http.post<ConciergeRequest>(`/v1/concierge/requests/${id}/answers`, { answers }),
    },
    provider: {
      me: () => http.get<ProviderMe>('/v1/providers/me'),
      onboard: (b: ProviderOnboardingInput) => http.post<ProviderMe>('/v1/providers/me', b),
      addDocument: (b: { kind: string; fileUrl: string }) => http.post<void>('/v1/providers/me/documents', b),
      setAvailability: (b: Infer<typeof SetAvailabilityInput>) =>
        http.patch<ProviderMe>('/v1/providers/me/availability', b),
      pushLocation: (b: Infer<typeof LocationBatchInput>) =>
        http.post<{ accepted: number }>('/v1/providers/me/location', b),
      schedule: () =>
        http.get<{ windows: Array<{ weekday: number; startMinute: number; endMinute: number }> }>(
          '/v1/providers/me/schedule',
        ),
      setSchedule: (b: { windows: Array<{ weekday: number; startMinute: number; endMinute: number }> }) =>
        http.put<{ windows: Array<{ weekday: number; startMinute: number; endMinute: number }> }>(
          '/v1/providers/me/schedule',
          b,
        ),
      offers: () => http.get<DispatchOffer[]>('/v1/providers/me/offers'),
      acceptOffer: (offerId: string) => http.post<ServiceOrderDetail>(`/v1/offers/${offerId}/accept`),
      rejectOffer: (offerId: string) => http.post<void>(`/v1/offers/${offerId}/reject`),
      orders: (q?: Infer<typeof OrderListQuery>) =>
        http.get<Page<ServiceOrder>>('/v1/providers/me/orders', q),
      indicators: (days = 30) => http.get<Record<string, unknown>>('/v1/providers/me/indicators', { days }),
      wallet: () => http.get<WalletSummary>('/v1/providers/me/wallet'),
      ledger: () => http.get<Array<Record<string, unknown>>>('/v1/providers/me/ledger'),
      payouts: () => http.get<Array<Record<string, unknown>>>('/v1/providers/me/payouts'),
    },
    ops: {
      map: () =>
        http.get<{
          orders: ServiceOrder[];
          providers: Array<{
            id: string;
            displayName: string;
            availability: string;
            lat: number;
            lng: number;
          }>;
        }>('/v1/ops/map'),
      orders: (q?: { status?: string; attention?: boolean; cursor?: string; limit?: number }) =>
        http.get<Page<ServiceOrder>>('/v1/ops/orders', q),
      order: (id: string) => http.get<ServiceOrderDetail>(`/v1/ops/orders/${id}`),
      candidates: (id: string) => http.get<Array<Record<string, unknown>>>(`/v1/ops/orders/${id}/candidates`),
      assign: (id: string, b: Infer<typeof ManualAssignInput>) =>
        http.post<ServiceOrderDetail>(`/v1/ops/orders/${id}/assign`, b),
      cancel: (id: string, reason: string) =>
        http.post<ServiceOrderDetail>(`/v1/ops/orders/${id}/cancel`, { reason }),
      incidents: () => http.get<Array<Record<string, unknown>>>('/v1/ops/incidents'),
      disputes: () => http.get<Dispute[]>('/v1/ops/disputes'),
      resolveDispute: (id: string, b: { outcome: string; refundCents: number; note: string }) =>
        http.post<Dispute>(`/v1/ops/disputes/${id}/resolve`, b),
      slas: () => http.get<Record<string, unknown>>('/v1/ops/slas'),
    },
    admin: {
      dashboard: (q?: { from?: string; to?: string }) =>
        http.get<DashboardMetrics>('/v1/admin/analytics/dashboard', q),
      list: <T>(resource: string, q?: Record<string, string | number | boolean | undefined>) =>
        http.get<T[]>(`/v1/admin/${resource}`, q),
      upsert: <T>(resource: string, body: unknown) => http.put<T>(`/v1/admin/${resource}`, body),
      remove: (resource: string, id: string) => http.delete<void>(`/v1/admin/${resource}/${id}`),
      approveProvider: (id: string, b: { decision: string; reason?: string }) =>
        http.post<ProviderMe>(`/v1/admin/providers/${id}/decision`, b),
      settings: () => http.get<Record<string, unknown>>('/v1/admin/settings'),
      updateSettings: (b: Record<string, unknown>) =>
        http.put<Record<string, unknown>>('/v1/admin/settings', b),
      workflows: () => http.get<Array<Record<string, unknown>>>('/v1/admin/workflows'),
    },
    analytics: {
      track: (b: {
        app: 'customer' | 'provider' | 'web';
        events: Array<{
          name: string;
          occurredAt: string;
          properties?: Record<string, unknown>;
          orderId?: string;
        }>;
      }) => http.post<void>('/v1/analytics/events', b),
    },
  };
}

export type VelioApi = ReturnType<typeof createApi>;
