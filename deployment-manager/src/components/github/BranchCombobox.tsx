'use client';

import useSWR from 'swr';
import Combobox from '~/components/general/Combobox';
import fetcher from '~/utils/fetcher';

interface BranchesResponse {
  connected?: boolean;
  branches?: string[];
  error?: string;
}

interface BranchComboboxProps {
  appId: number;
  id?: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Overrides the default connected/disconnected hint below the field. */
  hint?: React.ReactNode;
  error?: string;
  disabled?: boolean;
  className?: string;
}

const NOT_CONNECTED_HINT = "Connect GitHub on this app's settings page to get branch suggestions here.";

/**
 * A branch-name field that suggests real branches for an app connected to GitHub, and is
 * otherwise just a plain text field - never a picker the operator is stuck typing around.
 * Combobox (the primitive) already degrades to a plain input when there's nothing to
 * suggest; this component's only job is fetching that suggestion list for one specific app
 * and translating "not connected" / "fetch failed" into a fallback hint instead of an error
 * that would make a perfectly usable field look broken.
 *
 * `/api/apps/[appId]/github/branches` already fails open on the server side (a stale
 * connection, a GitHub outage, or a disconnected app all return normally rather than
 * throwing), so every case here is a degraded-but-working field, not an error state to
 * block on.
 */
export default function BranchCombobox({
  appId,
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  disabled,
  className,
}: BranchComboboxProps) {
  const { data, isLoading } = useSWR<BranchesResponse>(
    appId ? `/api/apps/${appId}/github/branches` : null,
    fetcher
  );

  const options = data?.branches ?? [];
  const connected = data?.connected === true;

  // Caller-supplied hint always wins. Otherwise: once we know for sure the app isn't
  // connected, explain why there are no suggestions; a fetch/GitHub-side error gets its
  // own (still non-blocking) explanation; while still loading, show nothing extra.
  const resolvedHint =
    hint ??
    (!isLoading && data && !connected
      ? data.error ?? NOT_CONNECTED_HINT
      : undefined);

  return (
    <Combobox
      id={id}
      name={name}
      label={label}
      value={value}
      onChange={onChange}
      options={connected ? options : []}
      loading={isLoading}
      placeholder={placeholder}
      hint={resolvedHint}
      error={error}
      disabled={disabled}
      className={className}
    />
  );
}
