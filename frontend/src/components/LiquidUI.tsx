import { useEffect } from "react";
import { mountLiquidGlass } from "../lib/liquidGlass";

export function LiquidUI() {
  useEffect(() => mountLiquidGlass(), []);
  return null;
}
