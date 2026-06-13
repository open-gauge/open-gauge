import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar breadcrumb={["Workspace", "Overview"]} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
