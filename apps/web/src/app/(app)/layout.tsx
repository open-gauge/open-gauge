import { AuthProvider } from "@/lib/auth-context";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";
import DemoBanner from "@/components/demo-banner";
import { docsSource } from "@/lib/docs-source";
import { isDemoMode } from "@/lib/demo/is-demo-mode";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-og-surface-alt">
        {isDemoMode() && <DemoBanner />}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar docsTree={docsSource.getPageTree()} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto og-grid-bg">{children}</main>
          </div>
        </div>
      </div>
    </AuthProvider>
  );
}
