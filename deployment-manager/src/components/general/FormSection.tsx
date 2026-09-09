import FieldGroup from './FieldGroup';

interface FormSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  /** A server action, for forms that don't need client-side state. */
  action?: (formData: FormData) => void;
  /** Right-aligned, in the panel's own footer. Stays disabled until something changes. */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * A Panel specialized for one form: header, a FieldGroup body, one Save in
 * its own footer. One Save per FormSection - never two commit actions in
 * the same panel.
 */
export default function FormSection({ title, children, onSubmit, action, footer, className }: FormSectionProps) {
  return (
    <form
      onSubmit={onSubmit}
      action={action}
      className={`bg-surface border border-line rounded-panel shadow-panel overflow-hidden ${className ?? ''}`}
    >
      <div className="px-13 py-9 bg-paper border-b border-line font-display font-semibold text-panel">{title}</div>
      <FieldGroup className="p-14">{children}</FieldGroup>
      {footer ? <div className="flex justify-end gap-7 px-13 py-10 bg-paper border-t border-line">{footer}</div> : null}
    </form>
  );
}
