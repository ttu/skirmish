# ECS Implementation Phase 2 - Game Systems

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement remaining game systems: Movement, Morale, Stamina, Ammo, Unit Factory, and turn resolution.

**Architecture:** Building on Phase 1 ECS foundation. Systems follow the pattern of operating on entities with specific components.

**Tech Stack:** TypeScript, Vitest

---

## Progress Tracker

- [x] Task 1: Movement System (16 tests)
- [x] Task 2: Stamina System (9 tests)
- [x] Task 3: Ammo System (10 tests)
- [x] Task 4: Morale System (15 tests)
- [x] Task 5: Unit Factory (8 tests)
- [x] Task 6: Turn Resolution System (18 tests)
- [x] Task 7: Full Turn Integration Test (10 tests)

**Phase 2 Complete:** 154 total tests passing

---

## Task 1: Movement System

Handles unit movement, facing, and engagement zones.

## Task 2: Stamina System

Tracks fatigue from actions, exhaustion penalties.

## Task 3: Ammo System

Manages ammunition consumption for ranged units.

## Task 4: Morale System

Morale checks, shaken/broken/routed states, rallying.

## Task 5: Unit Factory

Creates units from templates with all required components.

## Task 6: Turn Resolution System

Orchestrates all systems in correct order during resolution phase.

## Task 7: Full Turn Integration Test

End-to-end test of planning -> resolution -> turn advance.
