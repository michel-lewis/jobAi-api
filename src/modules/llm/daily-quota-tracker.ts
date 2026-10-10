export const DAILY_QUOTA_TRACKER = Symbol('DAILY_QUOTA_TRACKER');

/**
 * Lève LlmQuotaExceededError si l'utilisateur a déjà atteint `limitPerDay`
 * aujourd'hui (jour calendaire UTC) ; sinon incrémente. Une seule opération
 * atomique côté implémentation réelle — pas de lecture puis écriture séparées.
 */
export interface DailyQuotaTracker {
  consume(userId: string, limitPerDay: number): Promise<void>;
}
