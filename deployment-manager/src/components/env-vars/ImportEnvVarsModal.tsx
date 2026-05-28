'use client';

import { useMemo, useState } from 'react';
import Modal from '~/components/general/Modal';
import Button from '~/components/general/Button';
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
        body: JSON.stringify({ branch, envVars }),
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
      size="3xl"
    >
      {step === 'paste' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Paste the contents of a <code className="text-xs">.env</code> file for the{' '}
            {isPreview ? 'preview' : 'production'} environment. Existing keys are not
            overwritten. Platform-managed keys (database URL, MinIO, etc.) are ignored.
          </p>
          <textarea
            className="w-full h-64 font-mono text-sm border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={'RESEND_API_KEY=re_...\nNEXT_PUBLIC_APP_URL=https://example.com'}
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
          />
          {parseErrors.length > 0 && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800 space-y-1">
              {parseErrors.map((err) => (
                <p key={err}>{err}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" color="gray" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" color="blue" onClick={handleContinue}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md bg-green-50 border border-green-200 p-3">
              <span className="font-semibold text-green-900">{toImport.length}</span>
              <span className="text-green-800"> to import</span>
            </div>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
              <span className="font-semibold">{skipExists.length}</span>
              <span className="text-gray-600"> already set (skipped)</span>
            </div>
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <span className="font-semibold text-amber-900">{skipReserved.length}</span>
              <span className="text-amber-800"> platform keys (skipped)</span>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Key</th>
                  <th className="text-left px-3 py-2 font-medium">Value</th>
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviewRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-2 font-mono text-xs">{row.key}</td>
                    <td className="px-3 py-2 font-mono text-xs truncate max-w-xs" title={row.value}>
                      {row.value.length > 48 ? `${row.value.slice(0, 48)}…` : row.value}
                    </td>
                    <td className="px-3 py-2">
                      {row.status === 'import' && (
                        <span className="text-green-700">Import</span>
                      )}
                      {row.status === 'skip_exists' && (
                        <span className="text-gray-500">Skip (exists)</span>
                      )}
                      {row.status === 'skip_reserved' && (
                        <span className="text-amber-700">Skip (platform)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between gap-3">
            <Button type="button" color="gray" onClick={() => setStep('paste')} disabled={isSaving}>
              Back
            </Button>
            <div className="flex gap-3">
              <Button type="button" color="gray" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                type="button"
                color="green"
                onClick={handleSave}
                disabled={isSaving || toImport.length === 0}
              >
                {isSaving ? 'Saving…' : `Save ${toImport.length} variable${toImport.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
