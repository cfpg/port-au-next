'use client';

import { useState } from 'react';
import { authClient } from '~/lib/auth-client';
import Modal from '~/components/general/Modal';
import Input from '~/components/general/Input';
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
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password">
      <form onSubmit={handleSubmit} className="space-y-4">
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
        {error && (
          <div className="text-red-500 text-sm bg-red-50 p-2 rounded-md">
            {error}
          </div>
        )}
        {success && (
          <div className="text-green-500 text-sm bg-green-50 p-2 rounded-md">
            Password changed successfully! You will be redirected to the login page.
          </div>
        )}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
} 