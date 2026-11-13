#!/usr/bin/env bash
# Applies our fixes to the llama.cpp plugin after every npm install. Safe to run twice.
# Plugin 0.2.2's Android code drops images, ignores grammars after the first request and misses end-of-answer,
# builds the engine without its ARM-optimised kernels, and runs on every core including the slow ones.
set -e
cd "$(dirname "$0")/.."
target=node_modules/llama-cpp-capacitor
[ -d "$target" ] || exit 0
if grep -q "bm_fast_core_count" "$target/android/src/main/jni.cpp" && grep -q "bm-bids patch" "$target/android/src/main/CMakeLists.txt"; then
  echo "llama-cpp-capacitor: already patched"
else
  patch -p1 -d "$target" < patches/llama-cpp-capacitor-jni.patch
  echo "llama-cpp-capacitor: patched"
fi
