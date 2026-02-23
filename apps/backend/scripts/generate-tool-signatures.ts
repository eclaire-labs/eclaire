#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

interface ToolSignature {
  name: string;
  comment: string;
  signature: string;
}

/**
 * Generate tool signatures from TypeScript source files for production use.
 * This script extracts JSDoc comments and function signatures from the tools module
 * to avoid reading TypeScript files at runtime in containerized environments.
 */
async function generateToolSignatures() {
  try {
    const toolsFilePath = path.join(
      import.meta.dirname,
      "..",
      "src",
      "lib",
      "tools",
      "index.ts",
    );
    const outputPath = path.join(
      import.meta.dirname,
      "..",
      "tool-signatures.json",
    );

    console.log("📖 Reading tools from:", toolsFilePath);

    if (!fs.existsSync(toolsFilePath)) {
      throw new Error(`Tools file not found: ${toolsFilePath}`);
    }

    const sourceCode = fs.readFileSync(toolsFilePath, "utf-8");
    const signatures: ToolSignature[] = [];

    // Parse JSDoc comments and associated function signatures
    const functionPattern =
      /\/\*\*\s*\n\s*\*\s*(.+?)\s*\n\s*\*\/\s*\n\s*export\s+async\s+function\s+(\w+)\s*\(([^{]+)\)\s*:\s*([^{]+)/gs;

    let match: RegExpExecArray | null = functionPattern.exec(sourceCode);
    while (match !== null) {
      const comment = match[1]?.trim();
      const functionName = match[2];
      const params = match[3]?.trim();
      const returnType = match[4]?.trim();

      if (!comment || !functionName || !params || !returnType) {
        console.warn("Skipping incomplete match:", {
          comment,
          functionName,
          params,
          returnType,
        });
        match = functionPattern.exec(sourceCode);
        continue;
      }

      // Remove userId parameter and its type annotation (first parameter)
      const cleanedParams = params
        .split(",")
        .slice(1) // Remove first parameter (userId: string)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .join(", ");

      const signature = `${functionName}(${cleanedParams}): ${returnType}`;

      signatures.push({
        name: functionName,
        comment,
        signature,
      });

      console.log(`✅ Extracted signature for: ${functionName}`);
      match = functionPattern.exec(sourceCode);
    }

    if (signatures.length === 0) {
      throw new Error(
        "No tool signatures found. Check the function pattern regex.",
      );
    }

    // Write signatures to JSON file
    const output = {
      generatedAt: new Date().toISOString(),
      signatures: signatures.reduce(
        (acc, sig) => {
          acc[sig.name] = {
            comment: sig.comment,
            signature: sig.signature,
          };
          return acc;
        },
        {} as Record<string, { comment: string; signature: string }>,
      ),
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`🎉 Generated ${signatures.length} tool signatures`);
    console.log(`📝 Output written to: ${outputPath}`);
  } catch (error) {
    console.error("❌ Failed to generate tool signatures:", error);
    process.exit(1);
  }
}

// Run the script if called directly
// In ESM, we can just run the function directly since this file is executed as a script
generateToolSignatures();

export { generateToolSignatures };
