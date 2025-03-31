export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-xl font-bold text-gray-800 mb-8">Port-au-Next</h1>
      <div className="">
        {children}
      </div>
    </div>
  )
}