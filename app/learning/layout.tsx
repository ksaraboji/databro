import type { ReactNode } from "react";
import ProdFeatureGate from "@/components/prod-feature-gate";

type LearningLayoutProps = {
  children: ReactNode;
};

export default function LearningLayout({ children }: LearningLayoutProps) {
  return <ProdFeatureGate featureName="Brain Dump">{children}</ProdFeatureGate>;
}
