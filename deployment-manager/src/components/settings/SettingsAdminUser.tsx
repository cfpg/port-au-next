'use client';

import { useState } from 'react';
import Avatar from '~/components/general/Avatar';
import ChangePasswordModal from '~/components/modals/ChangePasswordModal';

interface SettingsAdminUserProps {
  email: string;
}

export default function SettingsAdminUser({ email }: SettingsAdminUserProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="flex items-center space-x-4">
        <Avatar name="Admin User" size="lg" className="w-48 h-48" />
        <div>
          <div className="text-lg font-medium">Admin User</div>
          <div className="text-sm text-gray-500">{email}</div>
        </div>
      </div>
      <div className="mt-4">
        <button
          onClick={() => setIsModalOpen(true)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          Change Password
        </button>
      </div>
      <ChangePasswordModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
} 