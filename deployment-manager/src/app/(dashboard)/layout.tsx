import { fetchApps } from "~/app/(dashboard)/actions";
import Sidebar from "~/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const apps = await fetchApps();

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-canvas">
      <aside className="w-full md:w-206 shrink-0 bg-surface border-b md:border-b-0 md:border-r border-line md:h-screen md:sticky md:top-0 z-30">
        <Sidebar apps={apps || []} />
      </aside>

      <main className="flex-1 min-w-0 md:h-screen md:overflow-y-auto p-14 md:p-18">
        {children}
      </main>
    </div>
  );
}
