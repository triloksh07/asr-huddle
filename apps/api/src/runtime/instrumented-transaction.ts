import type { Transaction, TransactionScope } from '@repo/application';
import type { RuntimeMetrics } from '../observability/runtime-metrics.js';
import type { StructuredLogger } from '../observability/structured-logger.js';

export class InstrumentedTransaction implements Transaction {
  constructor(
    private readonly transaction: Transaction,
    private readonly metrics: RuntimeMetrics,
    private readonly logger: StructuredLogger
  ) {}

  async run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await this.transaction.run(work);
      const durationMs = performance.now() - startedAt;
      this.metrics.recordDependency('postgres', 'transaction', true, durationMs);
      return result;
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      this.metrics.recordDependency('postgres', 'transaction', false, durationMs);
      this.logger.error('dependency_operation_failed', {
        dependency: 'postgres',
        operation: 'transaction',
        durationMs: Math.round(durationMs * 100) / 100,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }
}
