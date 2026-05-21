import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { getProjects } from "@/lib/config";
import { checkPorts } from "@/lib/port-checker";
import type { InitialSidebarProject } from "@/contexts/sidebar-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HexOps - Dev Project Manager",
  description: "Local development project management dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pre-fetch sidebar data server-side so the sidebar shows correct counts
  // immediately, bypassing WSL2 client-side fetch limitations.
  let initialProjects: InitialSidebarProject[] = [];
  try {
    const projectConfigs = getProjects();
    const portStatus = await checkPorts(projectConfigs.map(p => p.port));
    initialProjects = projectConfigs.map(config => ({
      id: config.id,
      name: config.name,
      category: config.category,
      status: portStatus.get(config.port) ? 'running' : 'stopped',
    }));
  } catch {
    // Fallback to empty — client-side polling will populate when available
  }

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950`}
      >
        <Providers initialSidebarProjects={initialProjects}>
          {children}
        </Providers>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#18181b',
              border: '1px solid #27272a',
              color: '#fafafa',
            },
          }}
        />
      </body>
    </html>
  );
}
