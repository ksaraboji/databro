import type { ReactNode } from "react";
import ProdFeatureGate from "@/components/prod-feature-gate";

type BackendLayoutProps = {
  children: ReactNode;
};

export default function BackendLayout({ children }: BackendLayoutProps) {
  return <ProdFeatureGate featureName="Burning My Credits">{children}</ProdFeatureGate>;
}
