import { performance } from "perf_hooks";

export interface PhaseTiming {
  name: string;
  durationMs: number;
  rowCount?: number;
}

export class ExecutionProfiler {
  private startTime: number;
  private lastTime: number;
  private phases: PhaseTiming[] = [];
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
  }

  mark(name: string, rowCount?: number): number {
    const now = performance.now();
    const durationMs = Math.round((now - this.lastTime) * 100) / 100;
    this.phases.push({ name, durationMs, rowCount });
    this.lastTime = now;
    return durationMs;
  }

  finish(): { label: string; totalMs: number; phases: PhaseTiming[] } {
    const totalMs = Math.round((performance.now() - this.startTime) * 100) / 100;
    return {
      label: this.label,
      totalMs,
      phases: this.phases,
    };
  }

  logSummary(): void {
    const summary = this.finish();
    const phaseStr = summary.phases
      .map((p) => `${p.name}: ${p.durationMs}ms${p.rowCount !== undefined ? ` (${p.rowCount} rows)` : ""}`)
      .join(" | ");
    console.log(`[PROFILER] ${summary.label} total: ${summary.totalMs}ms => [ ${phaseStr} ]`);
  }
}
