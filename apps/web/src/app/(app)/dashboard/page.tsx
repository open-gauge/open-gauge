import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import ActivityFeed from "@/components/dashboard/activity-feed";
import CalibrationCalendar from "@/components/dashboard/calibration-calendar";
import RecentAssets from "@/components/dashboard/recent-assets";
import StatsCards from "@/components/dashboard/stats-cards";
import UpcomingTable from "@/components/dashboard/upcoming-table";
import {
  getActivity,
  getAssetTypeDistribution,
  getCalendarEvents,
  getCalibrationEvents,
  getDashboardSummary,
  getRecentAssets,
} from "@/services/dashboard.service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const currentYear = new Date().getFullYear();

  const [summary, calEvents, calendarEvents, assetTypeDistribution, activity, recentAssets] =
    await Promise.all([
      getDashboardSummary(),
      getCalibrationEvents(),
      getCalendarEvents(currentYear),
      getAssetTypeDistribution(),
      getActivity(),
      getRecentAssets(),
    ]);

  return (
    <>
      {/*
       * h-full → fills `main` (height = 100vh − TopBar 56px).
       * flex flex-col so header + stats stay compact and the content row grows to fill.
       * Users scroll to see Recent Assets below this div.
       */}
      <div className="h-full flex flex-col gap-5 p-6">

        {/* Page header */}
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-og-text">Operations dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Real-time status across all sites, labs and instrumentation.
          </p>
        </div>

        {/* Stat cards — ~20% of visible height at typical viewport */}
        <div className="shrink-0">
          <StatsCards data={summary} assetTypeDistribution={assetTypeDistribution} />
        </div>

        {/*
         * Main content row — flex-1 fills all remaining height to the viewport bottom.
         *
         * Left column  (w-fit = calendar natural width):
         *   • CalibrationCalendar  – fixed, ~30% of visible height
         *   • UpcomingTable        – flex-1, fills remaining ~50%, scrollable
         *
         * Right column (flex-1):
         *   • ActivityFeed         – fills full height (~80%), scrollable
         */}
        <div className="flex gap-5 flex-1 min-h-0">

          {/* Left: calendar (natural height) + upcoming (fills rest) */}
          <div className="w-fit shrink-0 flex flex-col gap-5 min-h-0">
            <div className="shrink-0">
              <CalibrationCalendar initialEvents={calendarEvents} initialYear={currentYear} />
            </div>
            <div className="flex-1 min-h-0 w-full">
              <UpcomingTable data={calEvents} />
            </div>
          </div>

          {/* Right: activity feed spans the full row height */}
          <div className="flex-1 min-w-0 min-h-0">
            <ActivityFeed data={activity} />
          </div>

        </div>
      </div>

      {/* Recently updated assets — below the fold, revealed by scrolling */}
      <div className="px-6 pt-5 pb-6">
        <RecentAssets data={recentAssets} />
      </div>
    </>
  );
}
