'use client';

import { useMemo, useState } from 'react';
import Modal from '~/components/general/Modal';
import Button from '~/components/general/Button';
import Callout from '~/components/general/Callout';
import Badge from '~/components/general/Badge';
import { isReservedAppEnvKey } from '~/constants/reservedAppEnvKeys';
import { parseDotEnv } from '~/utils/parseDotEnv';
import { AppEnvVar } from '~/queries/fetchAppEnvVars';
import { showToast } from '~/components/general/Toaster';

type Step = 'paste' | 'review';

type ReviewRow = {
  key: string;
  value: string;
  status: 'import' | 'skip_exists' | 'skip_reserved';
};

interface ImportEnvVarsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appId: number;
  branch: string | null;
  isPreview: boolean;
  existingEnvVars: AppEnvVar[];
  onImported: () => void;
}

export default function ImportEnvVarsModal({
  isOpen,
  onClose,
  appId,
  branch,
  isPreview,
  existingEnvVars,
  onImported,
}: ImportEnvVarsModalProps) {
  const [step, setStep] = useState<Step>('paste');
  const [pasteContent, setPasteContent] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const existingKeys = useMemo(
    () => new Set(existingEnvVars.map((v) => v.key)),
    [existingEnvVars]
  );

  const reset = () => {
    setStep('paste');
    setPasteContent('');
    setParseErrors([]);
    setReviewRows([]);
    setIsSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const buildReview = (vars: Record<string, string>) => {
    const rows: ReviewRow[] = Object.entries(vars)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        if (isReservedAppEnvKey(key)) {
          return { key, value, status: 'skip_reserved' as const };
        }
        if (existingKeys.has(key)) {
          return { key, value, status: 'skip_exists' as const };
        }
        return { key, value, status: 'import' as const };
      });
    setReviewRows(rows);
    setStep('review');
  };

  const handleContinue = () => {
    const { vars, errors } = parseDotEnv(pasteContent);
    setParseErrors(errors);
    if (Object.keys(vars).length === 0 && errors.length > 0) {
      return;
    }
    if (Object.keys(vars).length === 0) {
      setParseErrors(['No environment variables found. Paste KEY=value lines from a .env file.']);
      return;
    }
    buildReview(vars);
  };

  const toImport = reviewRows.filter((row) => row.status === 'import');
  const skipExists = reviewRows.filter((row) => row.status === 'skip_exists');
  const skipReserved = reviewRows.filter((row) => row.status === 'skip_reserved');

  const handleSave = async () => {
    if (toImport.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      const envVars = Object.fromEntries(toImport.map((row) => [row.key, row.value]));
      const response = await fetch(`/api/apps/${appId}/env-vars/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, isPreview, envVars }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? 'Import failed');
      }

      const count = result.inserted?.length ?? toImport.length;
      showToast(
        `Imported ${count} environment variable${count === 1 ? '' : 's'}`,
        'success'
      );
      onImported();
      handleClose();
    } catch (error) {
      console.error('Import env vars failed:', error);
      setParseErrors([
        error instanceof Error ? error.message : 'Failed to save imported variables',
      ]);
      setStep('paste');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import from .env file"
      size="lg"
    >
      {step === 'paste' && (
        <div className="flex flex-col gap-14">
          <p className="text-field text-ink-muted">
            Paste the contents of a <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1">.env</span> file for the{' '}
            {isPreview ? 'preview' : 'production'} environment. Existing keys are not
            overwritten. Platform-managed keys (database URL, MinIO, etc.) are ignored.
          </p>
          <textarea
            className="w-full h-190 font-mono text-meta border border-line-strong rounded-control p-11 focus:outline-none focus:border-primary focus:shadow-focus"
            placeholder={'RESEND_API_KEY=re_...\nNEXT_PUBLIC_APP_URL=https://example.com'}
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
          />
          {parseErrors.length > 0 && (
            <Callout tone="danger">
              {parseErrors.map((err) => (
                <p key={err}>{err}</p>
              ))}
            </Callout>
          )}
          <div className="flex justify-end gap-7">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleContinue}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-14">
          <div className="grid grid-cols-3 gap-9">
            <div className="rounded-control bg-success-tint border border-success-line px-11 py-9">
              <span className="font-semibold text-success-ink">{toImport.length}</span>
              <span className="text-success-ink text-field"> to import</span>
            </div>
            <div className="rounded-control bg-idle-tint border border-idle-line px-11 py-9">
              <span className="font-semibold text-idle-ink">{skipExists.length}</span>
              <span className="text-idle-ink text-field"> already set (skipped)</span>
            </div>
            <div className="rounded-control bg-warning-tint border border-warning-line px-11 py-9">
              <span className="font-semibold text-warning-ink">{skipReserved.length}</span>
              <span className="text-warning-ink text-field"> platform keys (skipped)</span>
            </div>
          </div>

          <div className="max-h-380 overflow-y-auto border border-line rounded-menu">
            <table className="min-w-full text-field">
              <thead className="bg-paper sticky top-0">
                <tr>
                  <th className="text-left px-11 py-8 font-mono text-nano tracking-caps uppercase text-ink-faint font-medium">Key</th>
                  <th className="text-left px-11 py-8 font-mono text-nano tracking-caps uppercase text-ink-faint font-medium">Value</th>
                  <th className="text-left px-11 py-8 font-mono text-nano tracking-caps uppercase text-ink-faint font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {reviewRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-11 py-7 font-mono text-meta text-ink">{row.key}</td>
                    <td className="px-11 py-7 font-mono text-meta text-ink-muted truncate max-w-190" title={row.value}>
                      {row.value.length > 48 ? `${row.value.slice(0, 48)}...` : row.value}
                    </td>
                    <td className="px-11 py-7">
                      {row.status === 'import' && <Badge tone="success" withDot={false}>import</Badge>}
                      {row.status === 'skip_exists' && <Badge tone="idle" withDot={false}>skip - exists</Badge>}
                      {row.status === 'skip_reserved' && <Badge tone="warning" withDot={false}>skip - platform</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between gap-7">
            <Button type="button" variant="secondary" onClick={() => setStep('paste')} disabled={isSaving}>
              Back
            </Button>
            <div className="flex gap-7">
              <Button type="button" variant="secondary" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSave}
                loading={isSaving}
                disabled={isSaving || toImport.length === 0}
              >
                {`Save ${toImport.length} variable${toImport.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
