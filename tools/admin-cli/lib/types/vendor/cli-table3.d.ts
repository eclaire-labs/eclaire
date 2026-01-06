declare module "cli-table3" {
  interface TableConstructorOptions {
    head?: string[];
    colWidths?: number[];
    style?: {
      head?: string[];
      border?: string[];
      "padding-left"?: number;
      "padding-right"?: number;
    };
    chars?: {
      top?: string;
      "top-mid"?: string;
      "top-left"?: string;
      "top-right"?: string;
      bottom?: string;
      "bottom-mid"?: string;
      "bottom-left"?: string;
      "bottom-right"?: string;
      left?: string;
      "left-mid"?: string;
      mid?: string;
      "mid-mid"?: string;
      right?: string;
      "right-mid"?: string;
      middle?: string;
    };
  }

  class Table extends Array<any[]> {
    constructor(options?: TableConstructorOptions);
    push(...items: any[][]): number;
    toString(): string;
  }

  export = Table;
}
