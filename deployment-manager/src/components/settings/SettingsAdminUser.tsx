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
      <div className="flex items-center gap-14">
        <Avatar name="Admin User" size="lg" className="size-48 text-body" />
        <div>
          <div className="font-display font-semibold text-body">Admin User</div>
          <div className="font-mono text-meta text-ink-muted">{email}</div>
        </div>
      </div>
      <div className="mt-14">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="text-panel text-primary hover:text-primary-active cursor-pointer transition-colors duration-100"
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
