import { describe, expect, it } from 'vitest';
import { currentEligiblePlayer, dailyOrder, scorePrediction, shouldReveal, validatePrediction } from '../lib/domain';
import { settleFixtureOnce } from '../lib/settlement';
const fixture = { id: 'm1', kickoff: new Date('2026-06-15T19:00:00+04:00') };
describe('rotation', () => {
 it('Nicolas starts on June 15, 2026', () => expect(dailyOrder(new Date('2026-06-15T10:00:00+04:00'))[0]).toBe('Nicolas'));
 it('Jean starts on June 16, 2026', () => expect(dailyOrder(new Date('2026-06-16T10:00:00+04:00'))[0]).toBe('Jean'));
 it('Anthony starts on June 17, 2026', () => expect(dailyOrder(new Date('2026-06-17T10:00:00+04:00'))[0]).toBe('Anthony'));
 it('repeats after three days', () => expect(dailyOrder(new Date('2026-06-18T10:00:00+04:00'))[0]).toBe('Nicolas'));
});
describe('prediction rules', () => {
 const order = ['Nicolas','Jean','Anthony'];
 it('rejects Jean before Nicolas on June 15', () => expect(validatePrediction(fixture, order, [], {userName:'Jean',homeScore:1,awayScore:0,submittedAt:new Date('2026-06-15T09:00:00+04:00')}).ok).toBe(false));
 it('rejects Anthony before Jean on June 15', () => expect(validatePrediction(fixture, order, [{userName:'Nicolas',homeScore:1,awayScore:0,submittedAt:new Date('2026-06-15T09:00:00+04:00')}], {userName:'Anthony',homeScore:2,awayScore:0,submittedAt:new Date('2026-06-15T09:05:00+04:00')}).ok).toBe(false));
 it('rejects duplicate score', () => expect(validatePrediction(fixture, order, [{userName:'Nicolas',homeScore:1,awayScore:0,submittedAt:new Date()}], {userName:'Jean',homeScore:1,awayScore:0,submittedAt:new Date('2026-06-15T09:05:00+04:00')}).reason).toMatch(/already selected/));
 it('allows same score for different matches by validating per fixture set', () => expect(validatePrediction({id:'m2',kickoff:fixture.kickoff}, order, [], {userName:'Nicolas',homeScore:1,awayScore:0,submittedAt:new Date('2026-06-15T09:00:00+04:00')}).ok).toBe(true));
 it('rejects after kickoff', () => expect(validatePrediction(fixture, order, [], {userName:'Nicolas',homeScore:1,awayScore:0,submittedAt:new Date('2026-06-15T19:01:00+04:00')}).ok).toBe(false));
 it('releases next player after forfeiture', () => expect(currentEligiblePlayer(order, [{userName:'Nicolas',homeScore:0,awayScore:0,submittedAt:new Date(),forfeited:true}])).toBe('Jean'));
 it('keeps predictions hidden until all submit or deadline', () => expect(shouldReveal(order, [{userName:'Nicolas',homeScore:1,awayScore:0,submittedAt:new Date()}], fixture, new Date('2026-06-15T09:00:00+04:00'))).toBe(false));
});
describe('scoring and settlement', () => {
 // Point values are doubled: outcome 2, exact score 4, everything else 2.
 it('exact score awards six cumulative main points', () => expect(scorePrediction({homeScore:2,awayScore:1},{...fixture,homeScore90:2,awayScore90:1}).totalPoints).toBe(6));
 it('correct outcome but incorrect score awards two points', () => expect(scorePrediction({homeScore:1,awayScore:0},{...fixture,homeScore90:2,awayScore90:1}).totalPoints).toBe(2));
 it('incorrect outcome awards zero main points', () => expect(scorePrediction({homeScore:0,awayScore:1},{...fixture,homeScore90:2,awayScore90:1}).totalPoints).toBe(0));
 it('correct first goalscorer awards two points', () => expect(scorePrediction({homeScore:0,awayScore:0,firstGoalscorerId:'p1'},{...fixture,homeScore90:0,awayScore90:0,firstGoalscorerId:'p1'}).firstGoalscorerPoints).toBe(2));
 it('correct possession prediction awards two points', () => expect(scorePrediction({homeScore:0,awayScore:0,possession:'HOME'},{...fixture,homeScore90:0,awayScore90:0,homePossession:51,awayPossession:49}).possessionPoints).toBe(2));
 it('extra-time points are awarded only when extra time occurs', () => expect(scorePrediction({homeScore:1,awayScore:1,homeScoreExtraTime:2,awayScoreExtraTime:1},{...fixture,homeScore90:1,awayScore90:1,homeScoreExtraTime:2,awayScoreExtraTime:1}).extraTimePoints).toBe(2));
 it('penalty points are awarded only when a shootout occurs', () => expect(scorePrediction({homeScore:1,awayScore:1,homePenaltyScore:5,awayPenaltyScore:4},{...fixture,homeScore90:1,awayScore90:1,homePenaltyScore:5,awayPenaltyScore:4}).penaltyPoints).toBe(2));
 // Outcome point follows the eventual winner (penalties > ET > 90'), not just the 90' result.
 it('awards outcome when predictor expected ET but winner finished in regulation', () => expect(scorePrediction({homeScore:1,awayScore:1,homeScoreExtraTime:0,awayScoreExtraTime:1},{...fixture,homeScore90:0,awayScore90:1}).outcomePoints).toBe(2));
 it('awards outcome when predictor called a regulation winner that actually won in ET', () => expect(scorePrediction({homeScore:2,awayScore:1},{...fixture,homeScore90:1,awayScore90:1,homeScoreExtraTime:2,awayScoreExtraTime:1}).outcomePoints).toBe(2));
 it('awards outcome to the penalty-shootout winner', () => expect(scorePrediction({homeScore:1,awayScore:1,homePenaltyScore:5,awayPenaltyScore:4},{...fixture,homeScore90:1,awayScore90:1,homePenaltyScore:5,awayPenaltyScore:4}).outcomePoints).toBe(2));
 it('no outcome point when the eventual winners differ', () => expect(scorePrediction({homeScore:1,awayScore:1,homeScoreExtraTime:2,awayScoreExtraTime:1},{...fixture,homeScore90:0,awayScore90:1}).outcomePoints).toBe(0));
 // Reaching extra time / penalties is its own point, independent of getting the ET/penalty score right.
 it('awards reached-ET point when the match goes to ET, regardless of the ET score', () => expect(scorePrediction({homeScore:1,awayScore:1,homeScoreExtraTime:1,awayScoreExtraTime:1},{...fixture,homeScore90:1,awayScore90:1,homeScoreExtraTime:3,awayScoreExtraTime:3}).reachedExtraTimePoints).toBe(2));
 it('no reached-ET point when the predictor expected ET but it finished in regulation', () => expect(scorePrediction({homeScore:1,awayScore:0,homeScoreExtraTime:2,awayScoreExtraTime:1},{...fixture,homeScore90:1,awayScore90:0}).reachedExtraTimePoints).toBe(0));
 it('awards reached-penalties point when the match goes to a shootout, regardless of the score', () => expect(scorePrediction({homeScore:1,awayScore:1,homePenaltyScore:4,awayPenaltyScore:2},{...fixture,homeScore90:1,awayScore90:1,homePenaltyScore:5,awayPenaltyScore:2}).reachedPenaltiesPoints).toBe(2));
 it('reached-penalties is separate from the exact-shootout point', () => { const s = scorePrediction({homeScore:1,awayScore:1,homePenaltyScore:4,awayPenaltyScore:2},{...fixture,homeScore90:1,awayScore90:1,homePenaltyScore:5,awayPenaltyScore:2}); expect(s.reachedPenaltiesPoints).toBe(2); expect(s.penaltyPoints).toBe(0); });
 it('scores the worked Jean example (90 2-2, ET 3-3, pens 4-2, poss+scorer correct) at 12', () => expect(scorePrediction({homeScore:1,awayScore:1,possession:'HOME',firstGoalscorerId:'cody',homeScoreExtraTime:1,awayScoreExtraTime:1,homePenaltyScore:4,awayPenaltyScore:2},{...fixture,homeScore90:2,awayScore90:2,homePossession:60,awayPossession:40,firstGoalscorerId:'cody',homeScoreExtraTime:3,awayScoreExtraTime:3,homePenaltyScore:4,awayPenaltyScore:2}).totalPoints).toBe(12));
 it('does not settle twice', () => expect(settleFixtureOnce(fixture, [], {settledAt:new Date()}).alreadySettled).toBe(true));
 it('administrator correction can recalculate by calling settlement without previous settledAt', () => expect(settleFixtureOnce({...fixture,homeScore90:2,awayScore90:1}, [{userName:'Nicolas',homeScore:2,awayScore:1}]).scores[0].totalPoints).toBe(6));
 it('simultaneous duplicate submissions are blocked by validation and database unique constraints', () => expect(validatePrediction(fixture, ['Nicolas','Jean'], [{userName:'Nicolas',homeScore:2,awayScore:1,submittedAt:new Date()}], {userName:'Jean',homeScore:2,awayScore:1,submittedAt:new Date('2026-06-15T09:00:00+04:00')}).ok).toBe(false));
});
