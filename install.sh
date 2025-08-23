#!/bin/bash
set -e

# BeeperMCP Simplified Installation Script
# This script automates the setup of BeeperMCP server

echo "🚀 BeeperMCP Installation Script"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed and version is sufficient
check_nodejs() {
    print_status "Checking Node.js installation..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 22 or later."
        print_status "Visit: https://nodejs.org/en/download/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
    
    if [ "$MAJOR_VERSION" -lt 22 ]; then
        print_error "Node.js version $NODE_VERSION is not supported. Please install Node.js 22 or later."
        exit 1
    fi
    
    print_success "Node.js $NODE_VERSION is installed"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    npm ci
    print_success "Dependencies installed"
}

# Build the project
build_project() {
    print_status "Building BeeperMCP..."
    npm run build
    print_success "Build completed"
}

# Setup configuration
setup_configuration() {
    print_status "Setting up configuration..."
    
    if [ ! -f ".beeper-mcp-server.env" ]; then
        if [ -f ".beeper-mcp-server.env.example" ]; then
            cp .beeper-mcp-server.env.example .beeper-mcp-server.env
            print_success "Created configuration file from example"
        else
            print_warning "No example configuration found, creating basic config"
            cat > .beeper-mcp-server.env << EOF
MATRIX_HOMESERVER=https://matrix.beeper.com
MATRIX_USERID=@your-username:beeper.com
MATRIX_TOKEN=your-matrix-token-here
MCP_API_KEY=local-stdio-mode
MESSAGE_LOG_DIR=room-logs
MATRIX_CACHE_DIR=mx-cache
LOG_LEVEL=info
LOG_MAX_BYTES=5000000
LOG_RETENTION_DAYS=30
ENABLE_SEND_MESSAGE=1
EOF
        fi
    else
        print_warning "Configuration file already exists, skipping"
    fi
    
    print_status "Please edit .beeper-mcp-server.env with your Matrix credentials"
}

# Create startup scripts
create_startup_scripts() {
    print_status "Creating startup scripts..."
    
    # STDIO mode script (for local MCP clients)
    cat > start-stdio.sh << 'EOF'
#!/bin/bash
# Start BeeperMCP in STDIO mode (for local MCP clients like BoltAI)
echo "Starting BeeperMCP in STDIO mode..." >&2
cd "$(dirname "$0")"
export MCP_STDIO_MODE=1
node dist/beeper-mcp-server.js
EOF
    chmod +x start-stdio.sh
    
    # HTTP mode script
    cat > start-http.sh << 'EOF'
#!/bin/bash
# Start BeeperMCP in HTTP mode (for remote MCP clients)
echo "Starting BeeperMCP in HTTP mode on port 3000..." >&2
cd "$(dirname "$0")"
export MCP_HTTP_MODE=1
export MCP_SERVER_PORT=3000
node dist/beeper-mcp-server.js
EOF
    chmod +x start-http.sh
    
    print_success "Created startup scripts: start-stdio.sh and start-http.sh"
}

# Run tests to verify installation
run_tests() {
    print_status "Running tests to verify installation..."
    
    if npm run test > /dev/null 2>&1; then
        print_success "All tests passed"
    else
        print_warning "Some tests failed, but installation may still work"
        print_status "You can run 'npm test' manually to see detailed results"
    fi
}

# Main installation flow
main() {
    echo
    print_status "Starting BeeperMCP installation..."
    echo
    
    check_nodejs
    install_dependencies
    build_project
    setup_configuration
    create_startup_scripts
    run_tests
    
    echo
    print_success "🎉 BeeperMCP installation completed!"
    echo
    echo "Next steps:"
    echo "1. Edit .beeper-mcp-server.env with your Matrix credentials"
    echo "2. For local use (BoltAI, etc.): ./start-stdio.sh"
    echo "3. For HTTP mode: ./start-http.sh"
    echo "4. Run MCP client configuration: node mcp-client-config.js"
    echo
    print_status "For help, visit: https://github.com/beeper/beeper-mcp"
}

# Handle interruption
trap 'print_error "Installation interrupted"; exit 1' INT

# Run main installation
main