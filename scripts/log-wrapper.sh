#!/bin/bash

# Log wrapper script for overmind processes
# Usage: ./scripts/log-wrapper.sh <service_name> "<command>"

SERVICE_NAME="$1"
COMMAND="$2"

if [ -z "$SERVICE_NAME" ] || [ -z "$COMMAND" ]; then
    echo "Usage: $0 <service_name> \"<command>\""
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p data/logs

# Generate timestamp for log file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="data/logs/${SERVICE_NAME}-${TIMESTAMP}.log"

echo "Starting $SERVICE_NAME - logging to $LOG_FILE"

# Execute the command with dual output:
# - Show colored output in console
# - Save clean output (no ANSI codes) to log file
eval "$COMMAND" 2>&1 | tee >(sed 's/\x1b\[[0-9;]*m//g' > "$LOG_FILE")