import Brand from '~/components/general/Brand';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-14 py-32">
      <Brand size="lg" className="mb-24" />
      {children}
    </div>
  );
}
