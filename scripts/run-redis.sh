#!/bin/bash
# File: apps/workers/run_redis.sh
#
# Idempotent script to manage the 'workers-redis' container.
# - If the container is running, it attaches to its logs.
# - If not, it starts the container with the specified configuration and then attaches to the logs.

# Use consistent container name for all environments

# Define the network name
NETWORK_NAME="eclaire-net"

# Check if the network exists and create if needed
if [ -z "$(docker network ls -q --filter name=^${NETWORK_NAME}$)" ]; then
    echo "Network '$NETWORK_NAME' not found. Creating it now..."
    docker network create "$NETWORK_NAME"
else
    echo "Network '$NETWORK_NAME' already exists."
fi

CONTAINER_NAME="eclaire-redis"
DATA_ROOT="../data"

# Check if the container is already running.
# We redirect stderr to /dev/null to suppress "No such object" errors if the container doesn't exist.
if [ "$(docker inspect -f '{{.State.Running}}' $CONTAINER_NAME 2>/dev/null)" == "true" ]; then
  echo "Redis container '$CONTAINER_NAME' is already running. Attaching to logs..."
  # Attach to the logs of the existing container. This command will block
  # and keep the Overmind process alive, streaming the logs.
  docker logs -f $CONTAINER_NAME
else
  echo "Redis container '$CONTAINER_NAME' not found or not running. Starting it now..."
  # Clean up any old, *stopped* container with the same name to avoid conflicts.
  # The '|| true' part ensures the script doesn't fail if the container doesn't exist.
  docker rm $CONTAINER_NAME > /dev/null 2>&1 || true

  # Create centralized redis data directory
  mkdir -p "${DATA_ROOT}/redis"
  
  # Use production network settings (expose port internally)
  NETWORK_OPTS="--network $NETWORK_NAME"
  PORT_OPTS="--expose 6379"
  
  # Run the new container using your exact configuration.
  # The '-d' flag runs it in the background, and we will attach to logs immediately after.
  docker run -d \
    --name $CONTAINER_NAME \
    $PORT_OPTS \
    -v "$(realpath ${DATA_ROOT}/redis):/data" \
    --restart unless-stopped \
    $NETWORK_OPTS \
    redis:8-alpine \
    redis-server --appendonly yes --save ""

  # Immediately attach to the new container's logs. This is crucial.
  # It makes the script a long-running process that Overmind can manage.
  echo "Attaching to logs of new Redis container..."
  docker logs -f $CONTAINER_NAME
fi
