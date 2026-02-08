#!/bin/bash
set -e

echo "🦞 Deploying Kanban Board to Fly.io..."
echo ""

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ Error: flyctl is not installed"
    echo "Install with: curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if authenticated
if ! flyctl auth whoami &> /dev/null; then
    echo "❌ Error: Not authenticated with Fly.io"
    echo "Run: flyctl auth login"
    exit 1
fi

# Build frontend
echo "📦 Building frontend..."
cd ../kanban-app
npm run build

# Copy to server
echo "📁 Copying build to server..."
cd ../kanban-server
rm -rf public/*
cp -r ../kanban-app/build/* public/

# Deploy
echo "🚀 Deploying to Fly.io..."
flyctl deploy

echo ""
echo "✅ Deployment complete!"
echo "🌐 Live at: https://kanban-server.fly.dev"
echo ""
echo "To check status: flyctl status"
echo "To view logs: flyctl logs"
