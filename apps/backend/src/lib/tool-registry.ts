import fs from "fs";
import path from "path";
import * as tools from "./tools/index.js";

interface PreGeneratedSignatures {
  generatedAt: string;
  signatures: Record<string, { comment: string; signature: string }>;
}

/**
 * Tool registry that automatically generates signatures and handles dispatch
 * for tool functions defined in the tools module.
 */
export class ToolRegistry {
  private toolMap: Map<string, Function> = new Map();
  private toolComments: Map<string, string> = new Map();
  private preGeneratedSignatures: Map<string, string> = new Map();

  constructor() {
    this.loadToolComments();
    this.registerAllTools();
  }

  /**
   * Load JSDoc comments from pre-generated JSON (production) or TypeScript source (development)
   */
  private loadToolComments() {
    // Try to load from pre-generated signatures first (production)
    if (this.tryLoadPreGeneratedSignatures()) {
      return;
    }

    // Fallback to reading TypeScript source files (development)
    try {
      const toolsFilePath = path.join(import.meta.dirname, "tools", "index.ts");
      const sourceCode = fs.readFileSync(toolsFilePath, "utf-8");

      // Parse JSDoc comments and associated function names
      const commentPattern =
        /\/\*\*\s*\n\s*\*\s*(.+?)\s*\n\s*\*\/\s*\n\s*export\s+async\s+function\s+(\w+)/g;
      let match;

      while ((match = commentPattern.exec(sourceCode)) !== null) {
        const comment = match[1]?.trim();
        const functionName = match[2];

        if (!comment || !functionName) continue;
        this.toolComments.set(functionName, comment);
      }
    } catch (error) {
      console.warn(
        "Could not load tool comments from TypeScript source:",
        error,
      );
    }
  }

  /**
   * Register all exported tool functions from the tools module
   */
  private registerAllTools() {
    Object.entries(tools).forEach(([name, func]) => {
      if (typeof func === "function") {
        this.toolMap.set(name, func);
      }
    });
  }

  /**
   * Generate TypeScript-style function signatures for use in AI prompts
   * Similar to mcpHost.ts getToolSignatures()
   */
  getToolSignatures(): string {
    const toolDocs: string[] = [];

    for (const [toolName, toolFunc] of this.toolMap.entries()) {
      let docs = "";

      // Get JSDoc comment from loaded comments
      const comment = this.toolComments.get(toolName);

      if (comment) {
        docs += `// ${comment}\n`;
      } else {
        docs += `// ${toolName}\n`;
      }

      // Generate function signature from the actual function
      const signature = this.generateSignature(toolName, toolFunc);
      docs += signature;

      toolDocs.push(docs);
    }

    return toolDocs.join("\n\n");
  }

  /**
   * Execute a tool by name with the provided arguments
   */
  async executeTool(
    toolName: string,
    userId: string,
    args: any = {},
  ): Promise<any> {
    const toolFunc = this.toolMap.get(toolName);

    if (!toolFunc) {
      throw new Error(`Tool ${toolName} not found`);
    }

    try {
      // Parse date strings to Date objects if present
      const processedArgs = this.processArguments(args);

      // Call the tool function with userId as first parameter and spread the rest
      return await toolFunc(
        userId,
        ...this.extractFunctionArgs(toolFunc, processedArgs),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to execute ${toolName}: ${errorMessage}`);
    }
  }

  /**
   * Get list of available tool names
   */
  getToolNames(): string[] {
    return Array.from(this.toolMap.keys());
  }

  /**
   * Try to load pre-generated signatures from JSON file
   */
  private tryLoadPreGeneratedSignatures(): boolean {
    try {
      // Look for tool-signatures.json in the project root
      const signaturesPath = path.join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "tool-signatures.json",
      );

      if (!fs.existsSync(signaturesPath)) {
        return false;
      }

      const signaturesData = fs.readFileSync(signaturesPath, "utf-8");
      const signatures: PreGeneratedSignatures = JSON.parse(signaturesData);

      // Load comments and signatures from pre-generated data
      for (const [toolName, data] of Object.entries(signatures.signatures)) {
        this.toolComments.set(toolName, data.comment);
        this.preGeneratedSignatures.set(toolName, data.signature);
      }

      console.log(
        `Loaded ${Object.keys(signatures.signatures).length} pre-generated tool signatures`,
      );
      return true;
    } catch (error) {
      console.warn("Could not load pre-generated signatures:", error);
      return false;
    }
  }

  /**
   * Generate function signature string from pre-generated data or TypeScript source
   */
  private generateSignature(toolName: string, _toolFunc: Function): string {
    // Check if we have a pre-generated signature
    const preGenerated = this.preGeneratedSignatures.get(toolName);
    if (preGenerated) {
      return preGenerated;
    }

    // Fallback to reading TypeScript source (development mode)
    try {
      const toolsFilePath = path.join(import.meta.dirname, "tools", "index.ts");
      const sourceCode = fs.readFileSync(toolsFilePath, "utf-8");

      // Find the function definition in the source
      const functionPattern = new RegExp(
        `export\\s+async\\s+function\\s+${toolName}\\s*\\(([^{]+)\\)\\s*:\\s*([^{]+)`,
        "s",
      );

      const match = sourceCode.match(functionPattern);
      if (match && match[1] && match[2]) {
        const params = match[1].trim();
        const returnType = match[2].trim();

        // Remove userId parameter and its type annotation
        const cleanedParams = params
          .split(",")
          .slice(1) // Remove first parameter (userId: string)
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
          .join(", ");

        return `${toolName}(${cleanedParams}): ${returnType}`;
      }
    } catch (error) {
      console.warn(`Could not generate signature for ${toolName}:`, error);
    }

    // Fallback to simplified signature
    const returnType = toolName.startsWith("count")
      ? "Promise<number>"
      : "Promise<any[]>";
    return `${toolName}(...args): ${returnType}`;
  }

  /**
   * Process arguments, converting date strings to Date objects
   */
  private processArguments(args: any): any {
    const processed = { ...args };

    // Convert date strings to Date objects
    if (processed.startDate && typeof processed.startDate === "string") {
      processed.startDate = new Date(processed.startDate);
    }
    if (processed.endDate && typeof processed.endDate === "string") {
      processed.endDate = new Date(processed.endDate);
    }

    return processed;
  }

  /**
   * Extract function arguments in the correct order for the tool function
   */
  private extractFunctionArgs(toolFunc: Function, args: any): any[] {
    // Get parameter names from function (excluding userId which is first)
    const funcString = toolFunc.toString();
    const paramMatch = funcString.match(/\(([^)]*)\)/);

    if (!paramMatch) {
      return [];
    }

    const paramsString = paramMatch[1];
    if (!paramsString) {
      return [];
    }

    const paramNames = paramsString
      .split(",")
      .slice(1) // Remove userId parameter
      .map((p) => {
        // Extract parameter name (remove type annotations and default values)
        const name = p.trim().split(":")[0]?.split("?")[0]?.trim();
        return name;
      })
      .filter((name): name is string => name !== undefined && name.length > 0);

    // Map arguments to parameter order
    return paramNames.map((name) => args[name]);
  }
}

// Create and export a singleton instance
export const toolRegistry = new ToolRegistry();
