import { scorePrediction } from './domain';
export function settleFixtureOnce(fixture: any, predictions: any[], previousSettlement?: { settledAt?: Date }) {
  if (previousSettlement?.settledAt) return { alreadySettled: true, scores: [] };
  const scores = predictions.filter(p => !p.forfeited).map(p => ({ userName: p.userName, ...scorePrediction(p, fixture) }));
  return { alreadySettled: false, settledAt: new Date(), scores };
}
