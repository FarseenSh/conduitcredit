#!/usr/bin/env bash
# Isolated Sui CLI config for the ConduitCredit project ONLY.
#
# Three sibling Claude sessions share this machine. We must NEVER touch the default
# ~/.sui config. Every `sui` invocation in this project runs with SUI_CONFIG_DIR
# pointed at a project-local dir, and we assert `sui client active-address` is this
# project's address before any transaction.
#
# Usage:  source scripts/sui-env.sh   (then run `sui ...` normally)
#     or: SUI_CONFIG_DIR=/Users/farseen/conduitcredit/.sui sui <cmd>
export SUI_CONFIG_DIR="/Users/farseen/conduitcredit/.sui"
echo "SUI_CONFIG_DIR=$SUI_CONFIG_DIR"
