import { describe, expect, it } from 'vitest';
import { executeAllAutomatedTests } from '../liveTestRunner';
import { createReferenceDiagnosticSessions } from '../sampleSessions';

describe('Iris Xe Diagnostic Suite v2 — Testes Unitários e de Integração Reais', () => {
  const results = executeAllAutomatedTests();

  for (const res of results) {
    it(`${res.id} [${res.suite}]: ${res.name}`, () => {
      expect(res.error).toBeUndefined();
      expect(res.passed).toBe(true);
      expect(res.actualDetails.length).toBeGreaterThan(5);
    });
  }

  it('TST-12 [Sessões Reproduzíveis]: Cria e valida as 4 sessões de referência (A, B, C, D) pelo pipeline real', () => {
    const sessions = createReferenceDiagnosticSessions();
    expect(sessions.length).toBe(4);

    const [sessionA, sessionB, sessionC, sessionD] = sessions;
    // Session A has thermal throttling and stutter events
    expect(sessionA.isSimulated).toBe(true);
    expect(sessionA.stats.validFrameCount).toBeGreaterThan(100);
    expect(sessionA.stats.stutterEventsCount).toBeGreaterThanOrEqual(2);
    expect(sessionA.findings.some((f) => f.id === 'diag-thermal-power-coupling')).toBe(true);
    expect(sessionA.findings.some((f) => f.id === 'diag-screen-tearing-mechanism')).toBe(true);

    // Session B (117 FPS Cap + Balanced) has higher 1% low and 0 stutter events
    expect(sessionB.stats.stutterEventsCount).toBe(0);
    expect(sessionB.stats.fps1PercentLow!).toBeGreaterThan(sessionA.stats.fps1PercentLow!);

    // Session C (Borderless / V-Sync ON) has zero tearing risk but higher display latency
    expect(sessionC.vsyncConfigured).toBe(true);
    expect(sessionC.findings.some((f) => f.id === 'diag-composed-flip-latency')).toBe(true);

    // Session D (Idle & Controlled Warmup)
    expect(sessionD.stageType).toBe('Repouso');
    expect(sessionD.hwinfoSamples.length).toBeGreaterThanOrEqual(20);
  });
});
