'use client';

import { useState } from 'react';
import { signIn } from '~/lib/auth-client';
import { useRouter } from 'next/navigation';
import Card from '~/components/general/Card';
import Input from '~/components/general/Input';

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
      setIsLoading(false);
      setError('Invalid email or password');
    }
  };

  return (
    <div className="w-full max-w-md">
      <Card
        title="Sign In"
        content={
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              id="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <div className="text-red-500 text-sm bg-red-50 p-2 rounded-md">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between">
              <button
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>
        }
      />
    </div>
  );
}