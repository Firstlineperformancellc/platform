// The one react-dom export the web build uses (HoverPreview.web.tsx). react-dom ships with Expo's web
// support but its types aren't installed; if @types/react-dom is ever added, delete this file.
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
