import Logo from './Logo';

interface BrandProps {
  size?: 'sm' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { icon: 20, text: 'text-body' },
  lg: { icon: 26, text: 'text-resource' },
};

/** The Port-Au-Next mark + wordmark, together. */
export default function Brand({ size = 'sm', className }: BrandProps) {
  const { icon, text } = SIZES[size];
  return (
    <div className={`flex items-center gap-9 ${className ?? ''}`}>
      <Logo size={icon} />
      <span className={`font-display font-semibold ${text} tracking-brand`}>Port-Au-Next</span>
    </div>
  );
}
