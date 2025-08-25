#!/bin/bash
(
  sleep 2
  echo "/add"
  sleep 2
  echo "4"
  sleep 2
  echo "ollama-turbo-provider"
  sleep 2
  echo "https://localhost:11435"
  sleep 2
  echo "/switch"
  sleep 2
  echo "1"
  sleep 2
  echo "1"
  sleep 2
  echo "Hello, world!"
  sleep 2
  echo "/quit"
) | npm run chat
