export interface Route {
  id: string;
  provider: string;
  sourceChain: string;
  destinationChain: string;
  estimatedFee: number;
  estimatedTimeMs: number;
  maxSlippage: number;
  contractAddress?: string;
}

export interface TransferRequest {
  sourceChain: string;
  destinationChain: string;
  asset: string;
  amount: string;
  sender: string;
  recipient: string;
  prioritize?: 'speed' | 'cost' | 'balanced';
}

export interface RouteEvaluation {
  route: Route;
  score: number;
  breakdown: {
    feeScore: number;
    speedScore: number;
    reliabilityScore: number;
  };
}

export interface SmartRoutingConfig {
  feeWeight: number;
  speedWeight: number;
  reliabilityWeight: number;
  maxRoutes: number;
  minReliabilityScore: number;
}

const DEFAULT_CONFIG: SmartRoutingConfig = {
  feeWeight: 0.4,
  speedWeight: 0.35,
  reliabilityWeight: 0.25,
  maxRoutes: 5,
  minReliabilityScore: 0.5,
};

export class SorobanSmartRoutingEngine {
  private config: SmartRoutingConfig;
  private routes: Route[] = [];
  private reliabilityScores: Map<string, number> = new Map();

  constructor(config: Partial<SmartRoutingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register available routes.
   */
  registerRoutes(routes: Route[]): void {
    this.routes.push(...routes);
  }

  /**
   * Update reliability score for a provider.
   */
  updateReliability(providerId: string, score: number): void {
    this.reliabilityScores.set(providerId, Math.max(0, Math.min(1, score)));
  }

  /**
   * Select the optimal route for a transfer request.
   */
  selectRoute(request: TransferRequest): RouteEvaluation | null {
    const candidates = this.filterCandidates(request);
    if (candidates.length === 0) return null;

    const evaluations = candidates.map((route) => this.evaluate(route, request));
    evaluations.sort((a, b) => b.score - a.score);
    return evaluations[0];
  }

  /**
   * Get top N routes ranked by score.
   */
  rankRoutes(request: TransferRequest, limit?: number): RouteEvaluation[] {
    const candidates = this.filterCandidates(request);
    const evaluations = candidates.map((route) => this.evaluate(route, request));
    evaluations.sort((a, b) => b.score - a.score);
    return evaluations.slice(0, limit || this.config.maxRoutes);
  }

  /**
   * Clear all registered routes.
   */
  clearRoutes(): void {
    this.routes = [];
  }

  private filterCandidates(request: TransferRequest): Route[] {
    return this.routes.filter(
      (r) =>
        r.sourceChain === request.sourceChain &&
        r.destinationChain === request.destinationChain,
    );
  }

  private evaluate(route: Route, request: TransferRequest): RouteEvaluation {
    const weights = this.getWeights(request.prioritize);
    const feeScore = this.scoreFee(route);
    const speedScore = this.scoreSpeed(route);
    const reliabilityScore = this.getReliability(route.provider);

    if (reliabilityScore < this.config.minReliabilityScore) {
      return { route, score: 0, breakdown: { feeScore, speedScore, reliabilityScore } };
    }

    const score =
      feeScore * weights.fee + speedScore * weights.speed + reliabilityScore * weights.reliability;

    return { route, score, breakdown: { feeScore, speedScore, reliabilityScore } };
  }

  private getWeights(priority?: 'speed' | 'cost' | 'balanced') {
    switch (priority) {
      case 'speed':
        return { fee: 0.2, speed: 0.6, reliability: 0.2 };
      case 'cost':
        return { fee: 0.6, speed: 0.2, reliability: 0.2 };
      default:
        return {
          fee: this.config.feeWeight,
          speed: this.config.speedWeight,
          reliability: this.config.reliabilityWeight,
        };
    }
  }

  private scoreFee(route: Route): number {
    // Lower fee = higher score (normalize inversely, cap at 1)
    return Math.max(0, 1 - route.estimatedFee / 100);
  }

  private scoreSpeed(route: Route): number {
    // Faster = higher score (normalize: under 30s is perfect)
    return Math.max(0, 1 - route.estimatedTimeMs / 300000);
  }

  private getReliability(provider: string): number {
    return this.reliabilityScores.get(provider) ?? 0.8;
  }
}
