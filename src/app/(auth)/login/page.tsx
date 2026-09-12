import { Suspense } from 'react';
import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';

import { LoginForm } from '@/features/auth/components/login-form';

export const metadata = buildMetadata({
  title: 'Sign in',
  path: '/login',
  noIndex: true,
});

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Welcome back</span>
        <h1 className="editorial-heading text-display-md">Sign in to Munasib</h1>
      </header>
      <Suspense fallback={<div className="h-64" />}>
        <LoginForm />
      </Suspense>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <Link href="/forgot-password" className="text-foreground underline underline-offset-4">
          Forgot your password?
        </Link>
        <p>
          New to Munasib?{' '}
          <Link href="/register" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
