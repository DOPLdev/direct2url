#!/bin/bash

# Build the server
echo "Building server..."
npm run build:server

# Build the client
echo "Building client..."
npm run build:client

echo "Build completed successfully!" 