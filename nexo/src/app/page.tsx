import { redirect } from 'next/navigation';
import { getWorkspaces } from '@/server/hierarchy';

export const dynamic = 'force-dynamic';

export default async function Index() {
  const ws = await getWorkspaces('u_danilo');
  redirect(ws[0] ? `/w/${ws[0].id}/home` : '/w/ws_main/home');
}
