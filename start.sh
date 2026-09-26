#!/bin/bash
# Startup script for Telegram Panel Bot

# Create required directories
mkdir -p database logs backup temp media

echo "✅ Directories created"
echo "🤖 Starting Telegram Panel Bot..."

node index.js
