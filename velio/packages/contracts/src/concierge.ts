import { z } from 'zod';
import { Cents, IsoDateTime, Uuid } from './common';
import { ConciergeInputType } from './enums';

export const ConciergeRequestInput = z.object({
  inputType: ConciergeInputType,
  text: z.string().min(5).max(2000).optional(),
  audioUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(4).default([]),
  addressId: Uuid.optional(),
  vehicleId: Uuid.optional(),
});
export type ConciergeRequestInput = z.infer<typeof ConciergeRequestInput>;

/** Plano estruturado produzido pelo planejador (IA ou regras) e validado antes de qualquer uso. */
export const ConciergePlanTask = z.object({
  seq: z.number().int().positive(),
  title: z.string().min(2).max(120),
  kind: z.enum([
    'VEHICLE_PICKUP',
    'TRANSPORT',
    'THIRD_PARTY_SERVICE',
    'WAIT',
    'RETURN_PICKUP',
    'VEHICLE_RETURN',
    'HOME_SERVICE',
    'PURCHASE',
    'DELIVERY',
    'CUSTOM',
  ]),
  serviceSlug: z.string().optional(),
  startsAt: IsoDateTime.optional(),
  dependsOnSeq: z.array(z.number().int()).default([]),
  estimateCents: Cents.optional(),
  notes: z.string().max(500).optional(),
});
export const ConciergePlan = z.object({
  summary: z.string().min(5).max(400),
  tasks: z.array(ConciergePlanTask).min(1).max(12),
  estimateMinCents: Cents,
  estimateMaxCents: Cents,
  confidence: z.number().min(0).max(1),
  /** Perguntas que o planejador precisa que o cliente responda antes de orçar. */
  clarifications: z.array(z.string().max(200)).default([]),
  requiresHuman: z.boolean(),
  requiresHumanReasons: z.array(z.string()).default([]),
});
export type ConciergePlan = z.infer<typeof ConciergePlan>;

export const ConciergeRequest = z.object({
  id: Uuid,
  orderId: Uuid,
  customerId: Uuid,
  inputType: ConciergeInputType,
  rawText: z.string().nullable(),
  transcript: z.string().nullable(),
  plan: ConciergePlan.nullable(),
  plannerName: z.string().nullable(),
  operatorUserId: Uuid.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ConciergeRequest = z.infer<typeof ConciergeRequest>;

export const ConciergeAnswerInput = z.object({
  answers: z.array(z.object({ question: z.string(), answer: z.string().max(500) })),
});
