'use client';

import { useState } from 'react';
import UserAvatar from '~/components/general/UserAvatar';
import ChangePasswordModal from '~/components/modals/ChangePasswordModal';

interface SettingsAdminUserProps {
  email: string;
}

export default function SettingsAdminUser({ email }: SettingsAdminUserProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="flex items-center space-x-4">
        <UserAvatar name="Admin User" className="w-12 h-12" />
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