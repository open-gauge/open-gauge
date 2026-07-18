import Image from "next/image";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { ThemeToggle } from "@/components/theme-toggle";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {/* Light mode: dark-text logo; dark mode: light-text logo (matches apps/web's sidebar) */}
          <Image src="/assets/Logo dark.png" alt="Open Gauge" width={140} height={28} priority className="block dark:hidden" />
          <Image src="/assets/Logo light.png" alt="Open Gauge" width={140} height={28} priority className="hidden dark:block" />
        </>
      ),
    },
    githubUrl: undefined,
    slots: {
      themeSwitch: ThemeToggle,
    },
  };
}
