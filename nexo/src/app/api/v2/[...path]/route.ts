import { currentUserId } from '@/server/http';
import { dispatch } from '@/server/router';
import '@/server/routes';

export const dynamic = 'force-dynamic';

const handler = dispatch(currentUserId);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
