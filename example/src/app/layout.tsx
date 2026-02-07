import type { Metadata } from "next";
import KTextConstants from "@/shared/constants/variables/text_constants";

import "./globals.css";

export const metadata: Metadata = {
  formatDetection: { email: true, telephone: true, url: true, },
  metadataBase: new URL(KTextConstants.baseUrl),
  robots: {
    follow: true,
    index: true,
  },
  appLinks: {
    web: {
      url: KTextConstants.baseUrl,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactNode {
  return children;
}
