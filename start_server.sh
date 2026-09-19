#!/bin/bash
# ARELM server launcher (used by launchd for persistent background operation)
cd "/Users/ari/Developer/AReGLM/server" || exit 1
exec "/Users/ari/.nvm/versions/node/v22.17.1/bin/node" index.js
