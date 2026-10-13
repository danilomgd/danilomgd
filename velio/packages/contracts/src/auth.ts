import { z } from 'zod';
import { PhoneBR, Uuid } from './common';
import { UserRole } from './enums';

export const OtpRequestInput = z.object({
  phone: PhoneBR,
  /** Para qual produto o código é pedido; define o papel criado no primeiro acesso. */
  app: z.enum(['customer', 'provider']).default('customer'),
});
export type OtpRequestInput = z.infer<typeof OtpRequestInput>;

export const OtpRequestResult = z.object({
  challengeId: Uuid,
  expiresInSeconds: z.number().int(),
  /** Presente apenas em NODE_ENV=test. Nunca em produção. */
  devCode: z.string().optional(),
});

export const OtpVerifyInput = z.object({
  challengeId: Uuid,
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().max(80).optional(),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifyInput>;

export const PasswordLoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type PasswordLoginInput = z.infer<typeof PasswordLoginInput>;

export const RefreshInput = z.object({ refreshToken: z.string().min(20) });

export const UserPublic = z.object({
  id: Uuid,
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(UserRole),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublic>;

export const AuthTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSeconds: z.number().int(),
  user: UserPublic,
  /** Se o usuário ainda não completou o perfil (nome, consentimentos). */
  needsOnboarding: z.boolean(),
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const UpdateProfileInput = z.object({
  name: z.string().min(2).max(80).optional(),
  email: z.string().email().optional(),
  timezone: z.string().default('America/Sao_Paulo').optional(),
  consents: z
    .object({
      terms: z.boolean(),
      privacy: z.boolean(),
      marketing: z.boolean().default(false),
      personalization: z.boolean().default(false),
    })
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const RegisterDeviceInput = z.object({
  pushToken: z.string().min(10),
  platform: z.enum(['ios', 'android', 'web']),
});

/** Payload do JWT de acesso. */
export const AccessTokenClaims = z.object({
  sub: Uuid,
  roles: z.array(UserRole),
  providerId: Uuid.optional(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaims>;
