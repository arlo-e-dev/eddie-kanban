#!/bin/bash
# Start the Kanban server

cd "$(dirname "$0")"

echo "🦞 Starting Eddie's Kanban Server..."
echo "   Press Ctrl+C to stop"
echo ""

node server.js
