export interface ContractInfo {
  contractId: string;
  wasmHash: string;
  interfaces: string[];
  version: string;
  network: 'mainnet' | 'testnet' | 'futurenet';
}

export interface CompatibilityResult {
  compatible: boolean;
  contractId: string;
  issues: CompatibilityIssue[];
  supportedStandards: string[];
  unsupportedStandards: string[];
}

export interface CompatibilityIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  interface?: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  check: (contract: ContractInfo) => CompatibilityIssue | null;
}

export interface ValidatorConfig {
  requiredInterfaces: string[];
  supportedVersions: string[];
  allowUnknownInterfaces: boolean;
}

const DEFAULT_CONFIG: ValidatorConfig = {
  requiredInterfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
  supportedVersions: ['0.1', '0.2', '0.3', '1.0'],
  allowUnknownInterfaces: false,
};

export class SorobanContractCompatibilityValidator {
  private config: ValidatorConfig;
  private customRules: ValidationRule[] = [];

  constructor(config: Partial<ValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate a contract for bridge compatibility.
   */
  validate(contract: ContractInfo): CompatibilityResult {
    const issues: CompatibilityIssue[] = [];

    // Check required interfaces
    const supported: string[] = [];
    const unsupported: string[] = [];

    for (const required of this.config.requiredInterfaces) {
      if (contract.interfaces.includes(required)) {
        supported.push(required);
      } else {
        unsupported.push(required);
        issues.push({
          severity: 'error',
          code: 'MISSING_INTERFACE',
          message: `Required interface "${required}" not found in contract`,
          interface: required,
        });
      }
    }

    // Check version compatibility
    if (!this.config.supportedVersions.includes(contract.version)) {
      issues.push({
        severity: 'error',
        code: 'UNSUPPORTED_VERSION',
        message: `Contract version "${contract.version}" is not supported. Supported: ${this.config.supportedVersions.join(', ')}`,
      });
    }

    // Detect unknown interfaces
    if (!this.config.allowUnknownInterfaces) {
      const knownInterfaces = new Set(this.config.requiredInterfaces);
      for (const iface of contract.interfaces) {
        if (!knownInterfaces.has(iface)) {
          issues.push({
            severity: 'warning',
            code: 'UNKNOWN_INTERFACE',
            message: `Unknown interface "${iface}" detected on contract`,
            interface: iface,
          });
        }
      }
    }

    // Run custom rules
    for (const rule of this.customRules) {
      const issue = rule.check(contract);
      if (issue) issues.push(issue);
    }

    const hasErrors = issues.some((i) => i.severity === 'error');

    return {
      compatible: !hasErrors,
      contractId: contract.contractId,
      issues,
      supportedStandards: supported,
      unsupportedStandards: unsupported,
    };
  }

  /**
   * Add a custom validation rule.
   */
  addRule(rule: ValidationRule): void {
    this.customRules.push(rule);
  }

  /**
   * Remove a custom validation rule by id.
   */
  removeRule(ruleId: string): void {
    this.customRules = this.customRules.filter((r) => r.id !== ruleId);
  }

  /**
   * Quick check if a contract has a specific interface.
   */
  hasInterface(contract: ContractInfo, interfaceName: string): boolean {
    return contract.interfaces.includes(interfaceName);
  }
}
