import { fetchApps } from "~/app/(dashboard)/actions";

import Sidebar from "~/components/Sidebar";

export default async function SidebarContainer() {
  const apps = await fetchApps();
  return (
    <Sidebar apps={apps} />
  )
}