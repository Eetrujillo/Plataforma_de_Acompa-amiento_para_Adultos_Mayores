import { useCallback, useEffect, useState } from 'react';

import { completeActivity, fetchDailyRoutine } from '../infrastructure/activitiesHttpAdapter.js';
import { todayIsoDate } from '../../../shared/utils/date.js';

const EMPTY_ROUTINE = { date: todayIsoDate(), activities: [], progress: { total: 0, completed: 0 } };

/**
 * Loads the daily routine of a senior and owns the completion action.
 */
export function useDailyRoutine({ seniorId, date = todayIsoDate() }) {
  const [routine, setRoutine] = useState(EMPTY_ROUTINE);
  const [loading, setLoading] = useState(Boolean(seniorId));
  const [error, setError] = useState(null);
  const [busyActivityId, setBusyActivityId] = useState(null);

  const load = useCallback(async () => {
    if (!seniorId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setRoutine(await fetchDailyRoutine({ seniorId, date }));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [seniorId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const complete = useCallback(
    async (activityId) => {
      setBusyActivityId(activityId);
      setError(null);

      try {
        await completeActivity(activityId);
        await load();
        return true;
      } catch (caught) {
        setError(caught.message);
        return false;
      } finally {
        setBusyActivityId(null);
      }
    },
    [load]
  );

  return { routine, loading, error, busyActivityId, reload: load, complete };
}
