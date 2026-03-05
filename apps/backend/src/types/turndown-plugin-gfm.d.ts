declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export function tables(service: TurndownService): void;
  export function strikethrough(service: TurndownService): void;
  export function gfm(service: TurndownService): void;
}
