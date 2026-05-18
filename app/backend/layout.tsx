import type { ReactNode } from "react";

type BackendLayoutProps = {
  children: ReactNode;
};

export default function BackendLayout({ children }: BackendLayoutProps) {
  return <>{children}</>;
}
