#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Set CONFIG_DIR to point to the config directory relative to project root
# If CONFIG_DIR is not already set, set it to the project's config directory
if [ -z "$CONFIG_DIR" ]; then
    export CONFIG_DIR="$SCRIPT_DIR/../../config"
fi

# Check if node_modules exists, if not install dependencies
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing model-cli dependencies..."
    cd "$SCRIPT_DIR" && npm install
fi

# Run the TypeScript file directly with tsx
cd "$SCRIPT_DIR" && npx tsx main.ts "$@"