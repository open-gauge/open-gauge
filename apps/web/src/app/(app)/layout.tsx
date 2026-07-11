import { AuthProvider } from "@/lib/auth-context";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";
import { docsSource } from "@/lib/docs-source";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden bg-og-surface-alt">
        <Sidebar docsTree={docsSource.getPageTree()} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto og-grid-bg">{children}</main>
        </div>
      </div>
    </AuthProvider>
  );
}
