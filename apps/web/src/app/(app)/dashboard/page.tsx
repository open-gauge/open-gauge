import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-[#152330]">Dashboard</h1>
        <p className="text-gray-500 text-sm">You are signed in. The workspace is coming soon.</p>
      </div>
    </div>
  );
}
