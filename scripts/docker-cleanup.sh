#!/bin/bash

# Eclaire Docker Cleanup Utility
# -------------------------------------
# This script provides various Docker cleanup operations to manage disk space
# and remove accumulated Docker artifacts.

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running or not accessible"
        exit 1
    fi
}

# Function to show disk usage before cleanup
show_disk_usage() {
    echo ""
    print_info "Docker disk usage before cleanup:"
    docker system df 2>/dev/null || print_warning "Could not get Docker disk usage"
}

# Function to clean dangling images
clean_dangling_images() {
    print_info "Removing dangling images..."
    
    local dangling_images=$(docker images -f "dangling=true" -q)
    if [ -n "$dangling_images" ]; then
        docker rmi $dangling_images 2>/dev/null || print_warning "Some dangling images could not be removed"
        print_success "Dangling images removed"
    else
        print_info "No dangling images to remove"
    fi
}

# Function to clean unused containers
clean_unused_containers() {
    print_info "Removing stopped containers..."
    
    local stopped_containers=$(docker ps -a -f "status=exited" -q)
    if [ -n "$stopped_containers" ]; then
        docker rm $stopped_containers 2>/dev/null || print_warning "Some stopped containers could not be removed"
        print_success "Stopped containers removed"
    else
        print_info "No stopped containers to remove"
    fi
}

# Function to clean unused networks
clean_unused_networks() {
    print_info "Removing unused networks..."
    
    # Don't remove the eclaire-net network as it's actively used
    docker network prune -f --filter "label!=keep" 2>/dev/null || print_warning "Could not prune networks"
    print_success "Unused networks cleaned"
}

# Function to clean unused volumes
clean_unused_volumes() {
    print_info "Removing unused volumes..."
    
    docker volume prune -f 2>/dev/null || print_warning "Could not prune volumes"
    print_success "Unused volumes cleaned"
}

# Function to clean build cache
clean_build_cache() {
    print_info "Cleaning build cache..."
    
    docker builder prune -f 2>/dev/null || print_warning "Could not prune build cache"
    print_success "Build cache cleaned"
}

# Function to clean old Eclaire images (keep current + previous for rollback)
clean_old_eclaire_images() {
    print_info "Cleaning old Eclaire images..."
    
    # List of current image names that should be kept
    local current_images=(
        "eclaire"
    )
    
    # Find and remove old/duplicate Eclaire images
    for image_name in "${current_images[@]}"; do
        # Get all images with this name, sorted by creation time (newest first)
        local image_ids=$(docker images "$image_name" --format "table {{.ID}}" | tail -n +2)
        if [ -n "$image_ids" ]; then
            # Count how many we have
            local count=$(echo "$image_ids" | wc -l)
            if [ "$count" -gt 2 ]; then
                print_warning "Found $count images for $image_name, keeping latest 2 for rollback capability"
                # Keep only the first 2 (latest) images, remove the rest
                echo "$image_ids" | tail -n +3 | xargs -r docker rmi 2>/dev/null || print_warning "Could not remove some old $image_name images"
            elif [ "$count" -eq 2 ]; then
                print_info "Found $count images for $image_name, keeping both (current + previous)"
            else
                print_info "Found $count image for $image_name, keeping it"
            fi
        fi
    done
    
    print_success "Old Eclaire images cleaned (kept current + previous versions)"
}

# Function to perform comprehensive cleanup
comprehensive_cleanup() {
    print_info "Starting comprehensive Docker cleanup..."
    
    clean_unused_containers
    clean_dangling_images
    clean_old_eclaire_images
    clean_unused_networks
    clean_unused_volumes
    clean_build_cache
    
    print_success "Comprehensive cleanup completed"
}

# Function to perform deployment cleanup (safer, for use during deployments)
deployment_cleanup() {
    print_info "Starting deployment cleanup..."
    
    clean_dangling_images
    clean_unused_containers
    clean_old_eclaire_images
    
    print_success "Deployment cleanup completed"
}

# Function to show help
show_help() {
    echo "Eclaire Docker Cleanup Utility"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  --dangling          Remove dangling images only"
    echo "  --containers        Remove stopped containers only"
    echo "  --networks          Remove unused networks only"
    echo "  --volumes           Remove unused volumes only"
    echo "  --build-cache       Remove build cache only"
    echo "  --old-images        Remove old Eclaire images only"
    echo "  --deployment        Safe cleanup for deployment (containers + dangling + old images)"
    echo "  --comprehensive     Full cleanup (all of the above)"
    echo "  --disk-usage        Show Docker disk usage"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --deployment     # Safe cleanup during deployment"
    echo "  $0 --comprehensive  # Full cleanup"
    echo "  $0 --dangling       # Remove only dangling images"
    echo ""
}

# Main script logic
main() {
    check_docker
    
    case "${1:-}" in
        --dangling)
            show_disk_usage
            clean_dangling_images
            ;;
        --containers)
            show_disk_usage
            clean_unused_containers
            ;;
        --networks)
            show_disk_usage
            clean_unused_networks
            ;;
        --volumes)
            show_disk_usage
            clean_unused_volumes
            ;;
        --build-cache)
            show_disk_usage
            clean_build_cache
            ;;
        --old-images)
            show_disk_usage
            clean_old_eclaire_images
            ;;
        --deployment)
            show_disk_usage
            deployment_cleanup
            ;;
        --comprehensive)
            show_disk_usage
            comprehensive_cleanup
            ;;
        --disk-usage)
            docker system df
            ;;
        --help)
            show_help
            ;;
        "")
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
    
    # Show disk usage after cleanup (if cleanup was performed)
    if [ "${1:-}" != "--help" ] && [ "${1:-}" != "--disk-usage" ] && [ "${1:-}" != "" ]; then
        echo ""
        print_info "Docker disk usage after cleanup:"
        docker system df 2>/dev/null || print_warning "Could not get Docker disk usage"
    fi
}

# Run main function with all arguments
main "$@"