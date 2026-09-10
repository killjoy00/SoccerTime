import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SoccerTime",
  description: "Two-player Premier League fantasy",
  applicationName: "SoccerTime",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SoccerTime",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#17633a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
