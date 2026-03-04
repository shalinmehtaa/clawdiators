/**
 * Reef Rescue — Production Incident Response
 *
 * Data generator: creates a full CoralWatch ocean-monitoring codebase with
 * 3 injected bugs, realistic logs, corrupted database records, and metrics.
 *
 * Bug 1 (sensor-pipeline): Celsius-to-Kelvin conversion inlines the wrong
 *   formula — applies (C × 1.8 + 32) + 273.15 instead of C + 273.15.
 * Bug 2 (alert-router): Zone regex expects uppercase ZONE-[A-Z]\d but the
 *   format changed to lowercase zone-[a-z]\d — all alerts fall through to
 *   the fallback queue.
 * Bug 3 (dashboard-api): Cache key uses only stationId, missing the metric
 *   type — different metrics overwrite each other.
 */

// ── Seeded PRNG ──────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ── Domain Types ─────────────────────────────────────────────────────

interface Station {
  id: string;
  name: string;
  zone: string;
  depth: number;
  lat: number;
  lng: number;
}

interface Team {
  id: string;
  name: string;
  zones: string[];
}

interface SensorReading {
  id: string;
  stationId: string;
  timestamp: string;
  temperatureK: number;
  salinityPsu: number;
  depthM: number;
  sourceUnit: string;
  corrupted: boolean;
  correctTemperatureK?: number;
}

interface AlertRecord {
  id: string;
  stationId: string;
  zone: string;
  severity: string;
  routedTo: string;
  shouldRouteTo: string;
  timestamp: string;
  message: string;
}

interface LogLine {
  timestamp: string;
  service: string;
  level: string;
  requestId: string;
  message: string;
}

// ── Constants ────────────────────────────────────────────────────────

const REEF_NAMES = [
  "Coral Haven", "Abyssal Ridge", "Sapphire Shelf", "Kelp Cathedral",
  "Twilight Basin", "Biolume Trench", "Thermal Vent Alpha", "Barrier North",
  "Mangrove Fringe", "Pelagic Station", "Starfish Point", "Urchin Flats",
];

const TEAM_NAMES = [
  "Deep Ops", "Reef Patrol", "Thermal Watch", "Coastal Guard",
  "Benthic Response", "Pelagic Team",
];

const SEVERITIES = ["critical", "high", "medium", "low"];

// ── Generators ───────────────────────────────────────────────────────

function generateStations(rng: () => number, seed: number): Station[] {
  const count = randInt(rng, 8, 12);
  const stations: Station[] = [];
  for (let i = 0; i < count; i++) {
    const zone = `zone-${String.fromCharCode(97 + (i % 6))}${Math.floor(i / 6) + 1}`;
    stations.push({
      id: `reef-${seed}-${String(i).padStart(2, "0")}`,
      name: REEF_NAMES[i % REEF_NAMES.length],
      zone,
      depth: randInt(rng, 5, 4000),
      lat: -33 + rng() * 60,
      lng: 100 + rng() * 80,
    });
  }
  return stations;
}

function generateTeams(rng: () => number): Team[] {
  const teams: Team[] = [];
  for (let i = 0; i < TEAM_NAMES.length; i++) {
    const zone = `zone-${String.fromCharCode(97 + i)}`;
    teams.push({
      id: `team-${i + 1}`,
      name: TEAM_NAMES[i],
      zones: [`${zone}1`, `${zone}2`],
    });
  }
  return teams;
}

function buggyConversion(celsius: number): number {
  // Bug 1: applies Celsius→Fahrenheit→Kelvin instead of Celsius→Kelvin
  return (celsius * 1.8 + 32) + 273.15;
}

function correctConversion(celsius: number): number {
  return celsius + 273.15;
}

function generateSensorReadings(
  rng: () => number,
  seed: number,
  stations: Station[],
): SensorReading[] {
  const readings: SensorReading[] = [];
  const baseTime = new Date("2026-03-01T00:00:00Z").getTime();

  for (let i = 0; i < 200; i++) {
    const station = pick(rng, stations);
    const ts = new Date(baseTime + i * 300_000 + randInt(rng, 0, 60_000));
    const sourceUnit = rng() < 0.7 ? "celsius" : rng() < 0.5 ? "fahrenheit" : "kelvin";

    // Real deep-ocean temperature: -1 to 30 C depending on depth
    const celsiusTemp = station.depth > 1000
      ? 1 + rng() * 4   // deep ocean: 1-5 C
      : 15 + rng() * 15; // shallow: 15-30 C

    let storedK: number;
    let corrupted = false;
    let correctK: number | undefined;

    if (sourceUnit === "celsius") {
      // Bug 1 affects all Celsius readings — applies wrong formula
      storedK = buggyConversion(celsiusTemp);
      corrupted = true;
      correctK = correctConversion(celsiusTemp);
    } else if (sourceUnit === "fahrenheit") {
      const fahrenheitTemp = celsiusTemp * 1.8 + 32;
      storedK = (fahrenheitTemp - 32) / 1.8 + 273.15; // correct
      corrupted = false;
    } else {
      storedK = celsiusTemp + 273.15; // already kelvin input, stored correctly
      corrupted = false;
    }

    readings.push({
      id: `sr-${seed}-${String(i).padStart(4, "0")}`,
      stationId: station.id,
      timestamp: ts.toISOString(),
      temperatureK: Math.round(storedK * 100) / 100,
      salinityPsu: Math.round((30 + rng() * 8) * 100) / 100,
      depthM: station.depth + randInt(rng, -10, 10),
      sourceUnit,
      corrupted,
      correctTemperatureK: correctK ? Math.round(correctK * 100) / 100 : undefined,
    });
  }
  return readings;
}

function generateAlerts(
  rng: () => number,
  seed: number,
  stations: Station[],
  teams: Team[],
): AlertRecord[] {
  const alerts: AlertRecord[] = [];
  const baseTime = new Date("2026-03-01T00:00:00Z").getTime();

  for (let i = 0; i < 50; i++) {
    const station = pick(rng, stations);
    const severity = pick(rng, SEVERITIES);
    const ts = new Date(baseTime + i * 600_000 + randInt(rng, 0, 120_000));

    // Bug 2: zone format is lowercase but routing regex expects uppercase
    // So all alerts go to fallback
    const correctTeam = teams.find((t) =>
      t.zones.some((z) => station.zone === z),
    );

    alerts.push({
      id: `ALT-${seed}-${String(i).padStart(4, "0")}`,
      stationId: station.id,
      zone: station.zone,
      severity,
      routedTo: "fallback-queue", // Bug 2: always fallback
      shouldRouteTo: correctTeam?.id ?? "fallback-queue",
      timestamp: ts.toISOString(),
      message: severity === "critical"
        ? `Temperature anomaly at ${station.name}: reading exceeds safe threshold`
        : severity === "high"
          ? `Salinity drift detected at ${station.name}`
          : `Routine sensor check for ${station.name}`,
    });
  }
  return alerts;
}

function generateLogs(
  rng: () => number,
  seed: number,
  stations: Station[],
  readings: SensorReading[],
  alerts: AlertRecord[],
): Record<string, LogLine[]> {
  const baseTime = new Date("2026-03-01T00:00:00Z").getTime();
  const reqId = () => `req-${seed}-${randInt(rng, 10000, 99999)}`;

  const sensorLogs: LogLine[] = [];
  const alertLogs: LogLine[] = [];
  const dashboardLogs: LogLine[] = [];
  const systemLogs: LogLine[] = [];

  // ── Sensor pipeline logs ───────────────────────────────────────────
  const corruptedReadings = readings.filter((r) => r.corrupted);
  for (const r of corruptedReadings.slice(0, 25)) {
    const rid = reqId();
    sensorLogs.push({
      timestamp: r.timestamp,
      service: "sensor-ingestion",
      level: "INFO",
      requestId: rid,
      message: `Ingesting reading ${r.id} from station ${r.stationId} (unit=${r.sourceUnit})`,
    });
    // Deep ocean stations show obviously wrong temps
    if (r.depthM > 800) {
      sensorLogs.push({
        timestamp: r.timestamp,
        service: "sensor-ingestion",
        level: "WARN",
        requestId: rid,
        message: `Temperature reading ${r.temperatureK}K at depth ${r.depthM}m for station ${r.stationId} exceeds expected range (max ~280K for deep ocean). Source unit: ${r.sourceUnit}, raw value processed through inline conversion.`,
      });
    }
  }
  // Normal processing logs (red herrings)
  for (let i = 0; i < 15; i++) {
    const ts = new Date(baseTime + randInt(rng, 0, 86400000)).toISOString();
    sensorLogs.push({
      timestamp: ts,
      service: "sensor-ingestion",
      level: "INFO",
      requestId: reqId(),
      message: pick(rng, [
        "Batch ingestion completed: 50 readings processed in 230ms",
        "Connection pool recycled, 12 active connections",
        `Duplicate reading filtered for station ${pick(rng, stations).id}`,
        "Health check passed: database latency 4ms",
      ]),
    });
  }
  // Occasional timeout (red herring)
  sensorLogs.push({
    timestamp: new Date(baseTime + 43200000).toISOString(),
    service: "sensor-ingestion",
    level: "ERROR",
    requestId: reqId(),
    message: "Database write timeout after 5000ms — retrying batch (1/3)",
  });
  sensorLogs.push({
    timestamp: new Date(baseTime + 43205000).toISOString(),
    service: "sensor-ingestion",
    level: "INFO",
    requestId: reqId(),
    message: "Retry succeeded: batch committed after 890ms",
  });

  // ── Alert router logs ──────────────────────────────────────────────
  for (const a of alerts.slice(0, 30)) {
    const rid = reqId();
    alertLogs.push({
      timestamp: a.timestamp,
      service: "alert-router",
      level: "INFO",
      requestId: rid,
      message: `Processing alert ${a.id} for zone "${a.zone}" severity=${a.severity}`,
    });
    alertLogs.push({
      timestamp: a.timestamp,
      service: "alert-router",
      level: "ERROR",
      requestId: rid,
      message: `No routing rule matched zone "${a.zone}" for alert ${a.id}. Rules checked: ${6} patterns (ZONE-[A-Z]\\d format). Routing to fallback queue.`,
    });
  }
  // Config reload (red herring)
  alertLogs.push({
    timestamp: new Date(baseTime + 21600000).toISOString(),
    service: "alert-router",
    level: "INFO",
    requestId: reqId(),
    message: "Routing rules reloaded from config: 6 rules active",
  });

  // ── Dashboard API logs ─────────────────────────────────────────────
  const cacheStations = stations.slice(0, 5);
  for (const station of cacheStations) {
    const rid = reqId();
    const ts = new Date(baseTime + randInt(rng, 0, 86400000)).toISOString();
    // Bug 3: cache key collision — temperature request gets salinity from cache
    dashboardLogs.push({
      timestamp: ts,
      service: "dashboard-api",
      level: "DEBUG",
      requestId: rid,
      message: `Cache SET key="station-${station.id}" metric=temperature value=278.5K ttl=300s`,
    });
    dashboardLogs.push({
      timestamp: new Date(new Date(ts).getTime() + 2000).toISOString(),
      service: "dashboard-api",
      level: "DEBUG",
      requestId: reqId(),
      message: `Cache SET key="station-${station.id}" metric=salinity value=34.2PSU ttl=300s (overwrites previous entry)`,
    });
    dashboardLogs.push({
      timestamp: new Date(new Date(ts).getTime() + 5000).toISOString(),
      service: "dashboard-api",
      level: "WARN",
      requestId: reqId(),
      message: `Dashboard chart for station ${station.id} metric=temperature returned value 34.2PSU — value looks like salinity, not temperature. Cache key: "station-${station.id}"`,
    });
  }
  // Normal dashboard traffic
  for (let i = 0; i < 10; i++) {
    dashboardLogs.push({
      timestamp: new Date(baseTime + randInt(rng, 0, 86400000)).toISOString(),
      service: "dashboard-api",
      level: "INFO",
      requestId: reqId(),
      message: pick(rng, [
        "GET /api/dashboard/overview 200 45ms",
        "GET /api/dashboard/stations 200 120ms",
        `GET /api/dashboard/station/${pick(rng, stations).id}/chart 200 89ms`,
        "Cache stats: 342 hits / 28 misses (92.4% ratio)",
      ]),
    });
  }
  // Occasional 500 from cache corruption
  dashboardLogs.push({
    timestamp: new Date(baseTime + 72000000).toISOString(),
    service: "dashboard-api",
    level: "ERROR",
    requestId: reqId(),
    message: `TypeError: Cannot plot value "34.2PSU" on temperature axis — expected numeric Kelvin value. Station: ${cacheStations[0].id}`,
  });

  // ── System logs ────────────────────────────────────────────────────
  for (let i = 0; i < 20; i++) {
    const ts = new Date(baseTime + randInt(rng, 0, 86400000)).toISOString();
    systemLogs.push({
      timestamp: ts,
      service: pick(rng, ["nginx", "postgres", "redis", "cron"]),
      level: pick(rng, ["INFO", "INFO", "INFO", "WARN"]),
      requestId: "-",
      message: pick(rng, [
        "Connection from 10.0.1.42 accepted",
        "Slow query logged (>100ms): SELECT * FROM sensor_readings WHERE station_id = ...",
        "Redis: 10042 keys, 38MB used, 0 evictions",
        "Cron: daily aggregation job completed in 12.4s",
        "Postgres checkpoint completed: 48 buffers written",
        "Nginx: upstream response time 230ms (threshold 200ms)",
        "Redis: client list pruned, 3 idle connections closed",
        "SSL certificate expires in 42 days",
      ]),
    });
  }

  return {
    "sensor-pipeline": sensorLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    "alert-router": alertLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    "dashboard-api": dashboardLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    system: systemLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  };
}

function formatLogFile(logs: LogLine[]): string {
  return logs
    .map(
      (l) =>
        `${l.timestamp} [${l.service}] ${l.level.padEnd(5)} [${l.requestId}] ${l.message}`,
    )
    .join("\n");
}

// ── Codebase Generator ──────────────────────────────────────────────

function generateCodebase(
  seed: number,
  stations: Station[],
  teams: Team[],
): Record<string, string> {
  const files: Record<string, string> = {};

  files["src/models/types.ts"] = `// CoralWatch Data Models

export type SourceUnit = "celsius" | "fahrenheit" | "kelvin";
export type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface SensorReading {
  id: string;
  stationId: string;
  timestamp: string;
  temperatureK: number;   // stored in Kelvin
  salinityPsu: number;    // practical salinity units
  depthM: number;
  sourceUnit: SourceUnit; // original unit from sensor
}

export interface Alert {
  id: string;
  stationId: string;
  zone: string;
  severity: AlertSeverity;
  message: string;
  routedTo: string;
  createdAt: string;
}

export interface Station {
  id: string;
  name: string;
  zone: string;
  depth: number;
  lat: number;
  lng: number;
}

export interface RoutingRule {
  pattern: string;     // regex pattern to match zone
  team: string;        // team ID to route to
  priority: number;
}

export interface CacheEntry {
  key: string;
  value: string;       // JSON-serialized metric value
  ttlSecs: number;
  setAt: string;
}
`;

  files["src/utils/conversion.ts"] = `// Temperature conversion utilities
// NOTE: This module is the canonical source for unit conversions.
// All services should use these functions rather than inlining formulas.

import type { SourceUnit } from "../models/types";

export function celsiusToKelvin(c: number): number {
  return c + 273.15;
}

export function fahrenheitToKelvin(f: number): number {
  return (f - 32) * (5 / 9) + 273.15;
}

export function toKelvin(value: number, unit: SourceUnit): number {
  switch (unit) {
    case "kelvin":
      return value;
    case "celsius":
      return celsiusToKelvin(value);
    case "fahrenheit":
      return fahrenheitToKelvin(value);
    default:
      throw new Error(\`Unknown unit: \${unit}\`);
  }
}
`;

  files["src/utils/cache.ts"] = `// In-memory cache with TTL support

interface CacheItem {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheItem>();

export function cacheGet(key: string): unknown | undefined {
  const item = store.get(key);
  if (!item) return undefined;
  if (Date.now() > item.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return item.value;
}

export function cacheSet(key: string, value: unknown, ttlSecs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlSecs * 1000 });
}

export function cacheInvalidate(key: string): void {
  store.delete(key);
}

export function cacheStats(): { size: number; keys: string[] } {
  return { size: store.size, keys: [...store.keys()] };
}
`;

  // BUG 1: sensor-ingestion.ts inlines conversion with wrong formula
  files["src/services/sensor-ingestion.ts"] = `// Sensor data ingestion pipeline
// Receives raw readings from ocean sensors and normalizes to Kelvin.
//
// Refactored 2026-02-28: inlined conversion for performance —
// eliminates function call overhead on the hot path (~10k readings/min).

import type { SensorReading, SourceUnit } from "../models/types";
import { db } from "../db";

interface RawSensorPayload {
  sensorId: string;
  stationId: string;
  temperature: number;
  salinity: number;
  depth: number;
  unit: SourceUnit;
  timestamp: string;
}

export async function ingestReading(raw: RawSensorPayload): Promise<SensorReading> {
  // Inline conversion for hot-path performance (was: toKelvin(raw.temperature, raw.unit))
  const tempKelvin =
    raw.unit === "kelvin"
      ? raw.temperature
      : raw.unit === "fahrenheit"
        ? (raw.temperature - 32) * (5 / 9) + 273.15
        : (raw.temperature * 1.8 + 32) + 273.15; // celsius path

  const reading: SensorReading = {
    id: \`sr-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`,
    stationId: raw.stationId,
    timestamp: raw.timestamp,
    temperatureK: Math.round(tempKelvin * 100) / 100,
    salinityPsu: Math.round(raw.salinity * 100) / 100,
    depthM: raw.depth,
    sourceUnit: raw.unit,
  };

  await db.sensorReadings.insert(reading);
  return reading;
}

export async function ingestBatch(payloads: RawSensorPayload[]): Promise<number> {
  let count = 0;
  for (const raw of payloads) {
    await ingestReading(raw);
    count++;
  }
  return count;
}
`;

  // BUG 2: alert-router.ts has uppercase regex for zone matching
  const routingRulesJson = teams.map((t, i) => ({
    pattern: `^ZONE-${String.fromCharCode(65 + i)}\\\\d$`,
    team: t.id,
    priority: i + 1,
  }));

  files["src/services/alert-router.ts"] = `// Alert routing engine
// Routes incoming alerts to the appropriate on-call team based on zone.
//
// Zone format: sensors report zones as lowercase identifiers (e.g., "zone-a1").
// Routing rules use regex patterns to match zones to teams.

import type { Alert, RoutingRule } from "../models/types";

// Loaded from config/routing-rules.json at startup
const routingRules: RoutingRule[] = ${JSON.stringify(routingRulesJson, null, 2)};

export function routeAlert(alert: Alert): string {
  for (const rule of routingRules) {
    const regex = new RegExp(rule.pattern);
    if (regex.test(alert.zone)) {
      return rule.team;
    }
  }
  // No match — route to fallback
  return "fallback-queue";
}

export function getRoutingRules(): RoutingRule[] {
  return [...routingRules];
}

export function validateZone(zone: string): boolean {
  return /^zone-[a-z]\\d$/.test(zone);
}
`;

  files["config/routing-rules.json"] = JSON.stringify(routingRulesJson, null, 2);

  // BUG 3: dashboard-api.ts uses stationId-only cache keys
  files["src/services/dashboard-api.ts"] = `// Dashboard API — serves pre-aggregated metrics to the web frontend.
// Uses an in-memory cache to avoid repeated database queries for
// frequently-viewed stations.

import { cacheGet, cacheSet, cacheStats } from "../utils/cache";
import { db } from "../db";

const CACHE_TTL = 300; // 5 minutes

export async function getStationMetric(
  stationId: string,
  metric: "temperature" | "salinity" | "depth",
): Promise<{ value: number; unit: string; cachedAt?: string }> {
  // Check cache first
  const cacheKey = \`station-\${stationId}\`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return cached as { value: number; unit: string; cachedAt: string };
  }

  // Fetch from database
  const latest = await db.sensorReadings.findLatest(stationId);
  if (!latest) throw new Error(\`No readings for station \${stationId}\`);

  const result = {
    value: metric === "temperature" ? latest.temperatureK
         : metric === "salinity" ? latest.salinityPsu
         : latest.depthM,
    unit: metric === "temperature" ? "K"
        : metric === "salinity" ? "PSU"
        : "m",
    cachedAt: new Date().toISOString(),
  };

  // Cache the result for subsequent requests
  cacheSet(cacheKey, result, CACHE_TTL);
  return result;
}

export async function getDashboardOverview(): Promise<{
  stationCount: number;
  alertCount: number;
  cacheHitRate: number;
}> {
  const stats = cacheStats();
  return {
    stationCount: await db.stations.count(),
    alertCount: await db.alerts.countActive(),
    cacheHitRate: 0.92, // approximation
  };
}
`;

  // Clean files (no bugs — provide context)
  files["src/db.ts"] = `// Database access layer (simplified for workspace)
// In production this connects to PostgreSQL via connection pool.

export const db = {
  sensorReadings: {
    async insert(reading: unknown) { /* ... */ },
    async findLatest(stationId: string) { /* ... */ return null; },
    async query(sql: string) { /* ... */ return []; },
  },
  stations: {
    async count() { return 0; },
    async findById(id: string) { return null; },
  },
  alerts: {
    async countActive() { return 0; },
    async insert(alert: unknown) { /* ... */ },
  },
};
`;

  files["src/server.ts"] = `// CoralWatch API server entry point
import { ingestBatch } from "./services/sensor-ingestion";
import { routeAlert } from "./services/alert-router";
import { getStationMetric, getDashboardOverview } from "./services/dashboard-api";

// POST /api/ingest — bulk sensor data ingestion
// POST /api/alerts — alert processing + routing
// GET  /api/dashboard/overview — dashboard summary
// GET  /api/dashboard/station/:id/:metric — single metric for station
// GET  /health — health check

console.log("CoralWatch API starting on :8080");
`;

  files["config/stations.json"] = JSON.stringify(
    stations.map(({ id, name, zone, depth, lat, lng }) => ({ id, name, zone, depth, lat, lng })),
    null,
    2,
  );

  files["package.json"] = JSON.stringify(
    {
      name: "coralwatch-api",
      version: "3.2.1",
      scripts: {
        start: "tsx src/server.ts",
        test: "vitest run",
        lint: "eslint src/",
      },
      dependencies: {
        pg: "^8.11.0",
        redis: "^4.6.0",
        fastify: "^4.26.0",
      },
    },
    null,
    2,
  );

  // Git log showing the recent refactor that introduced Bug 1
  files["GIT_LOG.txt"] = `commit a7f3c2e (HEAD -> main)
Author: coral-bot <ops@coralwatch.io>
Date:   2026-02-28 14:32:00 +0000

    chore: update dependencies, fix lint warnings

commit e8d1b4f
Author: kai.tanaka <kai@coralwatch.io>
Date:   2026-02-28 10:15:00 +0000

    perf: inline temperature conversion in sensor-ingestion

    Eliminates function call overhead on the hot ingestion path.
    Raw throughput improved ~8% in microbenchmark.

    Moved from toKelvin() import to inline ternary. All three
    unit branches handled: kelvin (passthrough), fahrenheit
    (standard formula), celsius (standard formula).

commit 5c91a0d
Author: coral-bot <ops@coralwatch.io>
Date:   2026-02-27 09:00:00 +0000

    feat: switch zone format to lowercase identifiers

    Zones now use lowercase format (zone-a1) instead of
    uppercase (ZONE-A1) to align with the new sensor firmware
    v4.2 protocol. Updated station configs and sensor parsers.

    NOTE: downstream consumers of zone strings should update
    their pattern matching accordingly.

commit 2a4f8c1
Author: maya.chen <maya@coralwatch.io>
Date:   2026-02-26 16:45:00 +0000

    fix: increase cache TTL to 300s for dashboard metrics

    Previous 60s TTL caused excessive DB queries during peak
    dashboard usage. 300s is acceptable for monitoring data
    that refreshes every 5 minutes from sensors.

commit b0e23d9
Author: kai.tanaka <kai@coralwatch.io>
Date:   2026-02-25 11:20:00 +0000

    refactor: extract conversion utilities to shared module

    Created src/utils/conversion.ts with celsiusToKelvin,
    fahrenheitToKelvin, and toKelvin functions. All services
    should use this module for temperature conversions.
`;

  return files;
}

// ── Metrics Generator ───────────────────────────────────────────────

function generateMetrics(rng: () => number, seed: number): Record<string, unknown> {
  const hours = 24;
  const errorRates: Array<{ hour: number; sensor: number; alert: number; dashboard: number }> = [];
  const latency: Array<{ hour: number; p50: number; p95: number; p99: number }> = [];
  const cacheMetrics: Array<{ hour: number; hits: number; misses: number; evictions: number }> = [];

  for (let h = 0; h < hours; h++) {
    errorRates.push({
      hour: h,
      sensor: h > 6 ? randInt(rng, 8, 25) : randInt(rng, 0, 3), // errors spike after ingestion bug
      alert: randInt(rng, 15, 40), // consistently high due to routing bug
      dashboard: randInt(rng, 2, 12), // intermittent cache corruption
    });
    latency.push({
      hour: h,
      p50: randInt(rng, 20, 80),
      p95: randInt(rng, 100, 300),
      p99: randInt(rng, 200, 800),
    });
    cacheMetrics.push({
      hour: h,
      hits: randInt(rng, 200, 500),
      misses: randInt(rng, 10, 50),
      evictions: 0,
    });
  }

  return {
    error_rates: errorRates,
    latency,
    cache: cacheMetrics,
    summary: {
      sensor_error_rate_24h: "12.4%",
      alert_routing_fallback_rate: "100%",
      dashboard_data_mismatch_reports: 23,
      uptime_24h: "99.7%",
    },
  };
}

// ── Database Schema + Data ──────────────────────────────────────────

function generateDatabaseFiles(
  readings: SensorReading[],
  alerts: AlertRecord[],
  stations: Station[],
): Record<string, string> {
  const files: Record<string, string> = {};

  files["schema/tables.sql"] = `-- CoralWatch Database Schema (PostgreSQL 15)

CREATE TABLE stations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  zone        TEXT NOT NULL,
  depth_m     INTEGER NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sensor_readings (
  id              TEXT PRIMARY KEY,
  station_id      TEXT REFERENCES stations(id),
  timestamp       TIMESTAMPTZ NOT NULL,
  temperature_k   DOUBLE PRECISION NOT NULL,
  salinity_psu    DOUBLE PRECISION NOT NULL,
  depth_m         INTEGER NOT NULL,
  source_unit     TEXT NOT NULL CHECK (source_unit IN ('celsius', 'fahrenheit', 'kelvin')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alerts (
  id          TEXT PRIMARY KEY,
  station_id  TEXT REFERENCES stations(id),
  zone        TEXT NOT NULL,
  severity    TEXT NOT NULL,
  message     TEXT,
  routed_to   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_readings_station ON sensor_readings(station_id);
CREATE INDEX idx_readings_timestamp ON sensor_readings(timestamp);
CREATE INDEX idx_alerts_zone ON alerts(zone);
`;

  // CSV export of sensor readings (agent can analyze for corruption)
  const csvHeader = "id,station_id,timestamp,temperature_k,salinity_psu,depth_m,source_unit";
  const csvRows = readings.map(
    (r) =>
      `${r.id},${r.stationId},${r.timestamp},${r.temperatureK},${r.salinityPsu},${r.depthM},${r.sourceUnit}`,
  );
  files["data/sensor_readings.csv"] = [csvHeader, ...csvRows].join("\n");

  const alertHeader = "id,station_id,zone,severity,routed_to,timestamp,message";
  const alertRows = alerts.map(
    (a) =>
      `${a.id},${a.stationId},${a.zone},${a.severity},${a.routedTo},${a.timestamp},"${a.message}"`,
  );
  files["data/alert_history.csv"] = [alertHeader, ...alertRows].join("\n");

  // Cache state snapshot showing the collision
  const cacheEntries = stations.slice(0, 5).flatMap((s) => [
    { key: `station-${s.id}`, lastMetric: "salinity", value: "34.2", note: "overwrote temperature entry" },
  ]);
  files["data/cache_state.json"] = JSON.stringify(
    { snapshot_at: "2026-03-01T12:00:00Z", entries: cacheEntries },
    null,
    2,
  );

  return files;
}

// ── Architecture Doc ─────────────────────────────────────────────────

function generateArchitectureDoc(stations: Station[]): string {
  return `# CoralWatch Architecture

## System Overview

CoralWatch monitors ocean conditions across ${stations.length} sensor stations.
Data flows through three core services:

\`\`\`
Sensors → [Sensor Ingestion] → PostgreSQL → [Dashboard API] → Web Frontend
                                    ↓
                            [Alert Router] → Team Queues
\`\`\`

## Services

### Sensor Ingestion (sensor-ingestion)
- Receives raw sensor payloads via POST /api/ingest
- Normalizes temperature to Kelvin, validates ranges
- Writes to PostgreSQL \`sensor_readings\` table
- Throughput: ~10,000 readings/minute peak

### Alert Router (alert-router)
- Monitors incoming readings for threshold violations
- Routes alerts to on-call teams based on station zone
- Uses regex-based routing rules (config/routing-rules.json)
- Fallback: unmatched alerts go to \`fallback-queue\`

### Dashboard API (dashboard-api)
- Serves pre-aggregated metrics to the web frontend
- In-memory cache (Redis-backed in prod, in-process for dev)
- Cache key scheme: \`station-{stationId}\`
- TTL: 300 seconds

## Data Flow

1. Sensors report in native units (Celsius, Fahrenheit, or Kelvin)
2. Ingestion service converts all temperatures to Kelvin for storage
3. Readings are stored with \`source_unit\` for audit trail
4. Dashboard API reads latest values and caches per station
5. Alert router checks thresholds and routes to appropriate team

## Recent Changes (last 7 days)

- **2026-02-28**: Inlined temperature conversion in sensor-ingestion for performance
- **2026-02-27**: Switched zone format from uppercase (ZONE-A1) to lowercase (zone-a1)
- **2026-02-26**: Increased dashboard cache TTL from 60s to 300s
- **2026-02-25**: Extracted conversion utilities to shared module
`;
}

// ── Main Export ──────────────────────────────────────────────────────

export interface ReefRescueData {
  objective: string;
  groundTruth: Record<string, unknown>;
  codebase: Record<string, string>;
  logs: Record<string, LogLine[]>;
  readings: SensorReading[];
  alerts: AlertRecord[];
  stations: Station[];
  teams: Team[];
  metrics: Record<string, unknown>;
  dbFiles: Record<string, string>;
}

export function generateReefRescueData(seed: number): ReefRescueData {
  const rng = mulberry32(seed);
  const stations = generateStations(rng, seed);
  const teams = generateTeams(rng);
  const readings = generateSensorReadings(rng, seed, stations);
  const alerts = generateAlerts(rng, seed, stations, teams);
  const logs = generateLogs(rng, seed, stations, readings, alerts);
  const codebase = generateCodebase(seed, stations, teams);
  const metrics = generateMetrics(rng, seed);
  const dbFiles = generateDatabaseFiles(readings, alerts, stations);

  const corruptedIds = readings.filter((r) => r.corrupted).map((r) => r.id);
  const correctValues: Record<string, number> = {};
  for (const r of readings) {
    if (r.corrupted && r.correctTemperatureK !== undefined) {
      correctValues[r.id] = r.correctTemperatureK;
    }
  }

  const objective =
    `INCIDENT: CoralWatch production is experiencing three cascading failures. ` +
    `(1) Sensor ingestion pipeline is storing incorrect temperature readings — ` +
    `deep ocean stations report impossibly high temperatures. ` +
    `(2) Alert routing engine is sending ALL alerts to the fallback queue — ` +
    `no alerts reach the correct on-call teams. ` +
    `(3) Dashboard API intermittently shows wrong metric types — ` +
    `temperature charts display salinity values. ` +
    `Diagnose all three root causes, write fixes, create a data migration ` +
    `for corrupted records, and submit an incident postmortem.`;

  const groundTruth: Record<string, unknown> = {
    bugs: {
      sensor_pipeline: {
        root_cause:
          "Celsius-to-Kelvin conversion uses wrong formula: (C * 1.8 + 32) + 273.15 " +
          "instead of C + 273.15. The inline refactor in commit e8d1b4f accidentally " +
          "converts Celsius to Fahrenheit first, then adds 273.15.",
        file: "src/services/sensor-ingestion.ts",
        buggy_line: "(raw.temperature * 1.8 + 32) + 273.15",
        correct_line: "raw.temperature + 273.15",
        keywords: ["celsius", "kelvin", "conversion", "1.8", "fahrenheit", "inline", "formula"],
      },
      alert_routing: {
        root_cause:
          "Routing rules regex patterns use uppercase format (ZONE-[A-Z]\\d) but zones " +
          "switched to lowercase (zone-[a-z]\\d) in commit 5c91a0d. No rule matches, " +
          "so all alerts route to fallback.",
        file: "src/services/alert-router.ts",
        buggy_pattern: "^ZONE-[A-Z]\\d$",
        correct_pattern: "^zone-[a-z]\\d$",
        keywords: ["regex", "uppercase", "lowercase", "zone", "pattern", "case", "routing", "format"],
      },
      dashboard_cache: {
        root_cause:
          "Cache key uses only stationId (`station-${stationId}`) without the metric type. " +
          "When temperature is cached and then salinity is requested for the same station, " +
          "the salinity value overwrites the temperature cache entry (or vice versa).",
        file: "src/services/dashboard-api.ts",
        buggy_key: "station-${stationId}",
        correct_key: "station-${stationId}-${metric}",
        keywords: ["cache", "key", "metric", "overwrite", "collision", "stationId"],
      },
    },
    corrupted_record_ids: corruptedIds,
    correct_values: correctValues,
    corrupted_count: corruptedIds.length,
    migration_formula:
      "For records where source_unit='celsius': correct_temperature_k = (stored_k - 273.15 - 32) / 1.8 + 273.15",
  };

  return {
    objective,
    groundTruth,
    codebase,
    logs,
    readings,
    alerts,
    stations,
    teams,
    metrics,
    dbFiles,
  };
}

/**
 * Build all workspace files from the generated data.
 */
export function buildWorkspaceFiles(data: ReefRescueData, seed: number): Record<string, string> {
  const files: Record<string, string> = {};

  // Codebase
  for (const [path, content] of Object.entries(data.codebase)) {
    files[path] = content;
  }

  // Logs
  for (const [service, logs] of Object.entries(data.logs)) {
    files[`logs/${service}.log`] = formatLogFile(logs);
  }

  // Database files
  for (const [path, content] of Object.entries(data.dbFiles)) {
    files[path] = content;
  }

  // Metrics
  files["metrics/error_rates.json"] = JSON.stringify(
    (data.metrics as Record<string, unknown>).error_rates,
    null,
    2,
  );
  files["metrics/latency.json"] = JSON.stringify(
    (data.metrics as Record<string, unknown>).latency,
    null,
    2,
  );
  files["metrics/cache_metrics.json"] = JSON.stringify(
    (data.metrics as Record<string, unknown>).cache,
    null,
    2,
  );
  files["metrics/summary.json"] = JSON.stringify(
    (data.metrics as Record<string, unknown>).summary,
    null,
    2,
  );

  // Architecture doc
  files["architecture.md"] = generateArchitectureDoc(data.stations);

  return files;
}
