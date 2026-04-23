import type { ReactNode } from "react";
import ProdFeatureGate from "@/components/prod-feature-gate";

type TextRefinerLayoutProps = {
  children: ReactNode;
};

export default function TextRefinerLayout({ children }: TextRefinerLayoutProps) {
  return <ProdFeatureGate featureName="Text Refiner">{children}</ProdFeatureGate>;
}
