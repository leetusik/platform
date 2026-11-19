// Barrel for round 03 §5's system states (P28.S3) — the editorial failure block
// and its error-ref line, the toast region, and the skeleton vocabulary.
// Consumers import from "@/components/states"; nothing here carries new CSS,
// only the classes §3 already landed in `kb-console-responsive.css`.
export { Editorial } from "./editorial";
export { ErrorRef } from "./error-ref";
export {
  LoadingRegion,
  SkelBlock,
  SkelPageHead,
  SkelPanel,
  SkelTable,
  SkelTiles,
} from "./skeleton";
export { ToastRegion } from "./toast-region";
