import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tendies",
  description: "Xem trước wallpaper .tendies theo lớp PosterBoard và tải file gốc.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
