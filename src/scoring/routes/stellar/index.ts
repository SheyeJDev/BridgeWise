/**
 * Dynamic scoring helpers for Stellar routes.
 *
 * This module computes a network-aware score from real-time route telemetry
 * such as latency, failure pressure, liquidity availability, and route health.
 * Stellar route scoring is intentionally conservative when live metrics are
 * unavailable: it falls back to a neutral score rather than biasing ranking.
 */

export interface StellarNetworkMetrics {
  latencyMs?: number;          // Observed request latency for this route
  failureRate?: number;        // Observed failure rate (0-1)
  liquidityUsd?: number;       // Available liquidity in USD for route execution
  availability?: number;       // Current route availability (0-1)
  activeRouteCount?: number;   // Number of competing active routes on the same path
}

export interface StellarRouteNetworkFrame {
  networkMetrics?: StellarNetworkMetrics;
  successRate?: number;
}

interface NetworkMetricConfig {
  value?: number;
  pool: number[];
  lowerIsBetter: boolean;
  weight: number;
}

export function calculateStellarNetworkScore(
  route: StellarRouteNetworkFrame,
  allRoutes: StellarRouteNetworkFrame[]
): number {
  const network = route.networkMetrics;
  if (!network) {
    return 0.5;
  }

  const routesWithNetwork = allRoutes.map(r => r.networkMetrics ?? {});

  const failureRate = network.failureRate ?? (route.successRate != null ? 1 - route.successRate : undefined);
  const failurePool = allRoutes
    .map(r => r.networkMetrics?.failureRate ?? (r.successRate != null ? 1 - r.successRate : undefined))
    .filter(isFiniteNumber);

  const config: NetworkMetricConfig[] = [
    {
      value: network.latencyMs,
      pool: allRoutes.map(r => r.networkMetrics?.latencyMs).filter(isFiniteNumber),
      lowerIsBetter: true,
      weight: 0.35,
    },
    {
      value: failureRate,
      pool: failurePool,
      lowerIsBetter: true,
      weight: 0.25,
    },
    {
      value: network.availability,
      pool: allRoutes.map(r => r.networkMetrics?.availability).filter(isFiniteNumber),
      lowerIsBetter: false,
      weight: 0.2,
    },
    {
      value: network.liquidityUsd,
      pool: allRoutes.map(r => r.networkMetrics?.liquidityUsd).filter(isFiniteNumber),
      lowerIsBetter: false,
      weight: 0.15,
    },
    {
      value: network.activeRouteCount,
      pool: allRoutes.map(r => r.networkMetrics?.activeRouteCount).filter(isFiniteNumber),
      lowerIsBetter: true,
      weight: 0.05,
    },
  ];

  const scoredMetrics = config
    .map(metric => ({
      ...metric,
      normalized: normalizeNetworkMetric(metric.value, metric.pool, metric.lowerIsBetter),
    }))
    .filter(metric => metric.normalized !== null);

  if (scoredMetrics.length === 0) {
    return 0.5;
  }

  const totalWeight = scoredMetrics.reduce((sum, metric) => sum + metric.weight, 0);
  if (totalWeight === 0) {
    return 0.5;
  }

  return scoredMetrics.reduce((score, metric) => score + metric.normalized * metric.weight, 0) / totalWeight;
}

function normalizeNetworkMetric(
  value: number | undefined,
  pool: number[],
  lowerIsBetter: boolean
): number | null {
  if (!isFiniteNumber(value) || pool.length === 0) {
    return null;
  }

  const min = Math.min(...pool);
  const max = Math.max(...pool);
  if (min === max) {
    return 0.5;
  }

  const normalized = (value - min) / (max - min);
  return lowerIsBetter ? 1 - normalized : normalized;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
