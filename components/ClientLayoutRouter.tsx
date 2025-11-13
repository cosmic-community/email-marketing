"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { Settings } from "@/types";

interface ClientLayoutRouterProps {
  children: React.ReactNode;
  companyName: string;
}

export default function ClientLayoutRouter({
  children,
  companyName: serverCompanyName,
}: ClientLayoutRouterProps) {
  const pathname = usePathname();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    // Fetch settings for company name and brand logo
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const data = await response.json();
          setSettings(data.settings);
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      }
    };

    fetchSettings();
  }, []);

  // Pages that don't use the main layout (public pages)
  const noLayoutPages = ["/login"];

  if (noLayoutPages.includes(pathname) || pathname.startsWith("/subscribe") || pathname.startsWith("/public/")) {
    return <>{children}</>;
  }

  // Use server-fetched company name as fallback while settings are loading
  const companyName = settings?.metadata.company_name || serverCompanyName;
  const brandLogoUrl = settings?.metadata.brand_logo?.imgix_url;

  return (
    <Layout companyName={companyName} brandLogoUrl={brandLogoUrl}>
      {children}
    </Layout>
  );
}