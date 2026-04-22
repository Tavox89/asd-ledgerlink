import { parseBankNotification } from '../parsers';
import { sampleEmailFixtures } from '../fixtures/sample-emails';

describe('bank notification parser registry', () => {
  it('selects Banesco parser and extracts primary transfer fields', () => {
    const parsed = parseBankNotification(sampleEmailFixtures[0]);

    expect(parsed?.parserName).toBe('banesco-parser');
    expect(parsed?.bankName).toBe('Banesco');
    expect(parsed?.reference).toBe('REF879231');
    expect(parsed?.amount).toBe(1250.5);
    expect(parsed?.currency).toBe('VES');
    expect(parsed?.destinationAccountLast4).toBe('4821');
  });

  it('falls back to Mercantil parser and preserves extracted reference', () => {
    const parsed = parseBankNotification(sampleEmailFixtures[1]);

    expect(parsed?.parserName).toBe('mercantil-parser');
    expect(parsed?.reference).toBe('MTC552100');
    expect(parsed?.currency).toBe('USD');
  });
});
