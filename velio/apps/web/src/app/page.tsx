'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeForRoles, useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function RootPage() {
  const { status, roles } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
    else if (status === 'authenticated') router.replace(homeForRoles(roles));
  }, [status, roles, router]);
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <Spinner />
    </div>
  );
}
