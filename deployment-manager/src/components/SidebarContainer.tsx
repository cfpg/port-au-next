import Sidebar from "~/components/Sidebar";
import { App } from "~/types";

export default function SidebarContainer({ apps }: { apps: App[] }) {
  return (
    <Sidebar apps={apps} />
  )
}