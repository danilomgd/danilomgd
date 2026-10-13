import { PriceEstimateInput, SearchQuery } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errors } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type CatalogService, toCategoryDto, toServiceDto, toServiceSummary } from './service';

export function registerCatalogRoutes(app: FastifyInstance, svc: CatalogService) {
  app.get('/v1/catalog/home', async (req) => {
    const q = parse(
      z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }),
      req.query ?? {},
    );
    return svc.home(req.auth?.userId ?? null, q);
  });

  app.get('/v1/catalog/categories', async () => (await svc.listCategories()).map(toCategoryDto));

  app.get('/v1/catalog/services', async (req) => {
    const q = parse(z.object({ category: z.string().optional() }), req.query ?? {});
    return (await svc.listServices(q)).map(toServiceSummary);
  });

  app.get<{ Params: { slug: string } }>('/v1/catalog/services/:slug', async (req) => {
    const s = await svc.getServiceBySlug(req.params.slug);
    if (!s?.active) throw errors.notFound('Serviço');
    return toServiceDto(s);
  });

  app.get('/v1/catalog/search', async (req) => {
    const q = parse(SearchQuery, req.query ?? {});
    return (await svc.search(q.q)).map(toServiceSummary);
  });

  app.post('/v1/catalog/estimate', async (req) => {
    const b = parse(PriceEstimateInput, req.body);
    const { couponCode: _c, ...estimate } = await svc.estimate(b, req.auth?.userId ?? null);
    return estimate;
  });
}
