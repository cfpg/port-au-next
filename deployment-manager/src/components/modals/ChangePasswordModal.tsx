'use client';

import { useState } from 'react';
import { authClient } from '~/lib/auth-client';
import Modal from '~/components/general/Modal';
import Input from '~/components/general/Input';
import Button from '~/components/general/Button';
import Callout from '~/components/general/Callout';
import { useRouter } from 'next/navigation';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      await authClient.resetPassword({
        newPassword,
        fetchOptions: {
          onSuccess: () => {
            setSuccess(true);
            setTimeout(() => {
              router.push('/login');
            }, 2000);
          },
          onError: (ctx) => {
            setError(ctx.error.message);
          },
          onResponse: () => {
            setIsLoading(false);
          },
        },
      });
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-14">
        <Input
          type="password"
          id="newPassword"
          label="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
        <Input
          type="password"
          id="confirmPassword"
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
        />
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {success ? (
          <Callout tone="info">Password changed successfully. You&apos;ll be redirected to the login page.</Callout>
        ) : null}
        <div className="flex justify-end gap-7">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={isLoading}>
            Change password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
