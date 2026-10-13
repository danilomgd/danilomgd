/**
 * Testes de integração da API: sobem o banco PGlite em pasta temporária,
 * aplicam migrações + seed e exercitam o roteador /api/v2 de ponta a ponta.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let dir: string;
let handler: (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>;

async function call(method: string, path: string, body?: unknown, user = 'u_danilo') {
  const req = new Request(`http://localhost/api/v2/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': user },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handler(req, {
    params: Promise.resolve({ path: path.split('?')[0].split('/') }),
  });
  // biome-ignore lint/suspicious/noExplicitAny: resposta dinâmica
  return { status: res.status, data: (await res.json()) as any };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'nexo-test-'));
  process.env.PGLITE_DATA_DIR = dir;
  process.env.DATABASE_URL = '';
  const { currentUserId } = await import('@/server/http');
  const { dispatch } = await import('@/server/router');
  await import('@/server/routes');
  handler = dispatch(currentUserId);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('hierarquia', () => {
  it('lista workspaces e a árvore completa', async () => {
    const teams = await call('GET', 'team');
    expect(teams.status).toBe(200);
    expect(teams.data.teams[0].id).toBe('ws_main');
    const h = await call('GET', 'team/ws_main/hierarchy');
    expect(h.data.spaces.length).toBe(3);
    expect(h.data.spaces[0].folders[0].lists.length).toBeGreaterThan(0);
    expect(h.data.spaces[0].views.map((v: { type: string }) => v.type)).toContain('board');
  });

  it('cria space → pasta → lista com statuses e views padrão', async () => {
    const sp = await call('POST', 'team/ws_main/space', { name: 'Financeiro', color: '#2ea44f' });
    expect(sp.status).toBe(200);
    expect(sp.data.statuses.length).toBe(3);
    const fd = await call('POST', `space/${sp.data.id}/folder`, { name: 'Contas' });
    const ls = await call('POST', `folder/${fd.data.id}/list`, { name: 'A pagar' });
    expect(ls.data.statuses.length).toBe(3);
    expect(ls.data.views.length).toBe(5);
    const bad = await call('POST', `space/${sp.data.id}/list`, {});
    expect(bad.status).toBe(400);
  });
});

describe('tarefas', () => {
  it('cria, atualiza, comenta, registra tempo e exclui', async () => {
    const t = await call('POST', 'list/ls_civel/task', {
      name: 'Petição teste',
      priority: 2,
      assignees: ['u_ana'],
      tags: ['urgente', 'nova-tag'],
      customFields: { cf_cliente: 'Cliente X' },
    });
    expect(t.status).toBe(200);
    expect(t.data.customId).toMatch(/^NX-\d+$/);
    expect(t.data.status.status).toBe('a fazer');
    expect(t.data.assignees[0].id).toBe('u_ana');
    expect(t.data.tags.map((x: { name: string }) => x.name).sort()).toEqual([
      'nova-tag',
      'urgente',
    ]);
    expect(t.data.customFields.cf_cliente).toBe('Cliente X');

    const byCustom = await call('GET', `task/${t.data.customId}`);
    expect(byCustom.data.id).toBe(t.data.id);

    const up = await call('PUT', `task/${t.data.id}`, {
      status: 'concluído',
      assignees: { add: ['u_bruno'], rem: ['u_ana'] },
      dueDate: '2026-12-01',
    });
    expect(up.data.status.type).toBe('closed');
    expect(up.data.dateClosed).toBeTruthy();
    expect(up.data.assignees.map((a: { id: string }) => a.id)).toEqual(['u_bruno']);

    const invalid = await call('PUT', `task/${t.data.id}`, { status: 'inexistente' });
    expect(invalid.status).toBe(400);

    const act = await call('GET', `task/${t.data.id}/activity`);
    expect(act.data.activity.map((a: { type: string }) => a.type)).toEqual(
      expect.arrayContaining(['created', 'status', 'assignee']),
    );

    const c = await call(
      'POST',
      `task/${t.data.id}/comment`,
      { text: 'Olá @Bruno Costa, pode revisar?' },
      'u_danilo',
    );
    expect(c.data.user.id).toBe('u_danilo');
    const notif = await call('GET', 'team/ws_main/notification?unread=true', undefined, 'u_bruno');
    expect(
      notif.data.notifications.some((n: { type: string; taskId?: string }) => n.type === 'mention'),
    ).toBe(true);

    const start = await call('POST', 'team/ws_main/time_entries/start', { taskId: t.data.id });
    expect(start.data.data.end).toBeNull();
    const running = await call('GET', 'team/ws_main/time_entries/current');
    expect(running.data.data.id).toBe(start.data.data.id);
    const stop = await call('POST', 'team/ws_main/time_entries/stop');
    expect(stop.data.data.end).toBeTruthy();

    const ck = await call('POST', `task/${t.data.id}/checklist`, { name: 'Docs' });
    const item = await call('POST', `checklist/${ck.data.checklists[0].id}/checklist_item`, {
      name: 'Procuração',
    });
    expect(item.data.checklists[0].items.length).toBe(1);

    const dep = await call('POST', `task/${t.data.id}/dependency`, { dependsOn: 't_001' });
    expect(dep.data.dependencies.waitingOn).toContain('t_001');
    const self = await call('POST', `task/${t.data.id}/dependency`, { dependsOn: t.data.id });
    expect(self.status).toBe(400);

    const sub = await call('POST', 'list/ls_civel/task', { name: 'Sub', parentId: t.data.id });
    const parent = await call('GET', `task/${t.data.id}`);
    expect(parent.data.subtaskCount).toBe(1);

    const del = await call('DELETE', `task/${t.data.id}`);
    expect(del.status).toBe(200);
    expect((await call('GET', `task/${sub.data.id}`)).status).toBe(404);
  });

  it('filtra por lista, responsável e busca global', async () => {
    const mine = await call('GET', 'team/ws_main/task?assignees=u_carla');
    expect(
      mine.data.tasks.every((t: { assignees: { id: string }[] }) =>
        t.assignees.some((a) => a.id === 'u_carla'),
      ),
    ).toBe(true);
    const closed = await call('GET', 'list/ls_civel/task?include_closed=true');
    const open = await call('GET', 'list/ls_civel/task');
    expect(closed.data.tasks.length).toBeGreaterThan(open.data.tasks.length);
    const s = await call('GET', 'team/ws_main/search?q=contesta');
    expect(s.data.tasks.length).toBeGreaterThan(0);
  });

  it('move tarefa entre listas mapeando o status pelo nome', async () => {
    const t = await call('POST', 'list/ls_civel/task', { name: 'Mover', status: 'em andamento' });
    const moved = await call('PUT', `task/${t.data.id}`, { listId: 'ls_app_juridico' });
    expect(moved.data.listId).toBe('ls_app_juridico');
    expect(moved.data.spaceId).toBe('sp_ia');
    expect(moved.data.status.status).toBe('backlog');
  });
});

describe('módulos', () => {
  it('docs, metas e dashboards', async () => {
    const doc = await call('POST', 'team/ws_main/doc', { name: 'Manual' });
    expect(doc.data.pages.length).toBe(1);
    const pg = await call('PUT', `page/${doc.data.pages[0].id}`, { content: '# Oi\n\n- item' });
    expect(pg.data.content).toContain('# Oi');

    const goal = await call('POST', 'team/ws_main/goal', { name: 'Meta X' });
    const kr = await call('POST', `goal/${goal.data.id}/key_result`, {
      name: 'KR',
      stepsStart: 0,
      stepsEnd: 10,
      stepsCurrent: 5,
    });
    expect(kr.data.percent).toBe(50);

    const dash = await call('GET', 'dashboard/db_geral');
    expect(Object.keys(dash.data.data).length).toBe(dash.data.dashboard.widgets.length);
    const home = await call('GET', 'team/ws_main/home');
    expect(home.data.totals.mine).toBeGreaterThan(0);
  });

  it('statuses editáveis com realocação de tarefas', async () => {
    const r = await call('PUT', 'space/sp_mkt/status', [
      { id: 'st_m_idea', status: 'ideia', color: '#87909e', type: 'open' },
      { status: 'rascunho', color: '#1090e0', type: 'custom' },
      { id: 'st_m_pub', status: 'publicado', color: '#2ea44f', type: 'closed' },
    ]);
    expect(r.data.statuses.length).toBe(3);
    const t = await call('GET', 'task/t_200'); // estava em "produção", removido
    expect(t.data.status.status).toBe('ideia');
  });

  it('rota desconhecida retorna 404 em JSON', async () => {
    const r = await call('GET', 'nada/aqui');
    expect(r.status).toBe(404);
    expect(r.data.ECODE).toBe(404);
  });
});
