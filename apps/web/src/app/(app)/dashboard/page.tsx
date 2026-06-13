import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import ActivityFeed from "@/components/dashboard/activity-feed";
import CalibrationChart from "@/components/dashboard/calibration-chart";
import CategoryDistributionChart from "@/components/dashboard/category-distribution-chart";
import RecentAssets from "@/components/dashboard/recent-assets";
import StatsCards from "@/components/dashboard/stats-cards";
import UpcomingTable from "@/components/dashboard/upcoming-table";
import { DocumentIcon } from "@/components/icons";
import {
  getActivity,
  getCalibrationThroughput,
  getCategoryDistribution,
  getDashboardSummary,
  getRecentAssets,
  getUpcomingAssets,
} from "@/services/dashboard.service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [summary, throughput, categoryDistribution, upcoming, activity, recentAssets] =
    await Promise.all([
      getDashboardSummary(),
      getCalibrationThroughput(),
      getCategoryDistribution(),
      getUpcomingAssets(),
      getActivity(),
      getRecentAssets(),
    ]);

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-mar-text">Operations dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Real-time status across all sites, labs and instrumentation.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <DocumentIcon size={14} />
          Generate report
        </button>
      </div>

      {/* Stats */}
      <StatsCards data={summary} />

      {/* Charts */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          <CalibrationChart data={throughput} />
        </div>
        <CategoryDistributionChart data={categoryDistribution} />
      </div>

      {/* Upcoming + Activity */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          <UpcomingTable data={upcoming} />
        </div>
        <ActivityFeed data={activity} />
      </div>

      {/* Recent assets */}
      <RecentAssets data={recentAssets} />
    </div>
  );
}
