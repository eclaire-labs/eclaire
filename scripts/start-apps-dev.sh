#!/bin/bash
# Helper script to start application services using Overmind
# Uses custom socket file to avoid conflicts with external dependencies

echo "🚀 Starting application services (backend, workers, frontend)..."
overmind start -f Procfile -s ./.overmind-app.sock