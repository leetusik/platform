// The hi2vi design system's typed primitives: thin components that emit the signed markup and classes
// (src/hi2vi/styles/, design-system/hi2vi). No styling of their own and no Tailwind classes; a prop
// exists only for a variant the bundle has. Dialog and Toast behaviour, Keys, Trend, Copy and the
// `.usage` read-out are the frame components' (src/hi2vi/frame/); the Shell is src/hi2vi/shell/.
export { UiRoot, type UiRootProps, type UiScheme } from "./root";
export { LEGACY_BOUNDARY, Legacy } from "./boundary";
export {
  Button,
  ButtonLink,
  buttonClass,
  Swap,
  type ButtonLinkProps,
  type ButtonProps,
  type ButtonVariant,
} from "./button";
export {
  Badge,
  Count,
  Status,
  type StatusProps,
  type StatusState,
} from "./marks";
export {
  Panel,
  PanelBody,
  PanelFoot,
  PanelHead,
  type PanelBodyProps,
} from "./panel";
export { Ico, type IcoName, type IcoProps } from "./ico";
export { Say, type SayProps } from "./say";
export { Meter, meterPercent, type MeterProps } from "./meter";
export { Section, SectionHead } from "./section";
export { Table, type TableProps } from "./table";
export {
  Check,
  Field,
  FieldError,
  FieldSet,
  FormRow,
  Hint,
  Input,
  Label,
  Legend,
  Notice,
  Textarea,
  type NoticeProps,
} from "./field";
export { Stat, Stats, type StatProps } from "./stats";
export { Skeleton, type SkeletonProps } from "./skeleton";
export { Block, BlockText, BlockTitle, type BlockProps } from "./block";
export {
  Center,
  Cluster,
  Grid,
  Grow,
  Sidebar,
  SidebarMain,
  SidebarSide,
  Split,
  Stack,
  type Gap,
  type GridProps,
  type LayoutProps,
} from "./layout";
