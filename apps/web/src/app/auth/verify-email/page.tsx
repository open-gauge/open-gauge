"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyEmail } from "@/services/auth.service";
import { CheckCircleIcon, WarningIcon } from "@/components/icons";

type Status = "verifying" | "success" | "error";

function VerifyEmailCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError("Missing verification token.");
      return;
    }
    verifyEmail(token)
      .then((accessToken) => {
        localStorage.setItem("og_token", accessToken);
        setStatus("success");
        setTimeout(() => router.push("/dashboard"), 1500);
      })
      .catch((e: unknown) => {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Verification failed");
      });
  }, [searchParams, router]);

  return (
    <div className="bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 w-full max-w-sm text-center">
      {status === "verifying" && (
        <>
          <span className="inline-block w-8 h-8 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mb-4" />
          <h1 className="text-lg font-semibold text-og-text">Verifying your email…</h1>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircleIcon size={28} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-og-text">Email verified</h1>
          <p className="text-sm text-gray-500 mt-2">Redirecting to your workspace…</p>
        </>
      )}
      {status === "error" && (
        <>
          <WarningIcon size={28} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-og-text">Verification failed</h1>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
          <a href="/" className="inline-block mt-6 text-sm text-og-accent hover:underline">Back to sign in</a>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#dce8ec] dark:bg-og-bg og-grid-bg">
      <Suspense
        fallback={
          <div className="bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 w-full max-w-sm text-center">
            <span className="inline-block w-8 h-8 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
          </div>
        }
      >
        <VerifyEmailCard />
      </Suspense>
    </div>
  );
}
