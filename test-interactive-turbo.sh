#!/bin/bash
(
  sleep 1
  echo "/add"
  sleep 1
  echo "4"
  sleep 1
  echo "ollama-turbo-provider"
  sleep 1
  echo "https://localhost:11435"
  sleep 1
  echo "/switch"
  sleep 1
  echo "1" # Assuming this is the first provider, might need adjustment
  sleep 1
  echo "1" # Assuming ollama-turbo is the first model
  sleep 1
  echo "Hello, world!"
  sleep 1
  echo "/quit"
) | npm run chat
