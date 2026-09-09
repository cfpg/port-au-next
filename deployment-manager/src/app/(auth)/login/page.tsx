'use client';

import { useState } from 'react';
import { signIn } from '~/lib/auth-client';
import { useRouter } from 'next/navigation';
import Panel from '~/components/general/Panel';
import Input from '~/components/general/Input';
import Button from '~/components/general/Button';
import Callout from '~/components/general/Callout';
import packageJson from '../../../../package.json';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signIn.email(
        {
          email,
          password
        },
        {
          onRequest: () => {
            setIsLoading(true);
          },
          onResponse: () => {
            setIsLoading(false);
            router.push('/');
          },
        }
      );
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      setError('Invalid email or password');
    }
  };

  return (
    <div className="w-full max-w-380">
      <div className="text-center mb-24">
        <h1 className="font-display font-bold text-page tracking-title m-0">Sign in</h1>
        <p className="text-field text-ink-muted mt-4">Administrator access to the deployment dashboard.</p>
      </div>

      <Panel
        content={
          <form onSubmit={handleSubmit} className="flex flex-col gap-14">
            {error ? <Callout tone="danger">{error}</Callout> : null}
            <Input
              type="email"
              id="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showToggle
              required
            />
            <Button type="submit" variant="primary" loading={isLoading} className="w-full justify-center">
              Sign in
            </Button>
          </form>
        }
      />

      <p className="text-center font-mono text-mini text-ink-faint mt-16">
        port-au-next v{packageJson.version} &middot; self-hosted
      </p>
    </div>
  );
}
