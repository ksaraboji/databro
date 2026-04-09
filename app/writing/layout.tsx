import type { ReactNode } from "react";
import ProdFeatureGate from "@/components/prod-feature-gate";

type WritingLayoutProps = {
  children: ReactNode;
};

export default function WritingLayout({ children }: WritingLayoutProps) {
  return <ProdFeatureGate featureName="Build Logs">{children}</ProdFeatureGate>;
}
