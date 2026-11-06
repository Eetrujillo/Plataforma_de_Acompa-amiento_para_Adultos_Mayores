---
name: Offline-First Senior App
description: Add or change offline behavior in the older-adult app (localStorage cache, pending queues, background sync, device timezone, real completion time). Use when a change must survive a lost connection, retry a request automatically, or send an event time captured on the phone.
---

# Offline-First Senior App

The `/app` screens must stay usable with a bad connection. The pattern below is already in the
repo; reuse it instead of inventing a new one.

## Existing pieces

| Concern | File |
|---|---|
| Read cache + token + `PENDING_COMPLETIONS_KEY` | `frontend/src/services/olderAdultAppService.ts` |
| Pending completion queue + 15 s sync loop | `frontend/src/services/completionQueue.ts` |
| Sync host mounted once | `frontend/src/components/app/CompletionSyncHost.tsx` (in `main.jsx`) |
| Reminders while the app is open | `frontend/src/services/reminderService.ts`, `ActivityReminderHost.tsx` |
| Device date key, time from instant | `frontend/src/utils/activity.ts` |
| Offline banner, queued notice | `OlderAdultHomePage.tsx` + `.senior-offline` in `globals.css` |

## Rules

1. **Write locally first.** Persist the user action to `localStorage` before the HTTP call, then
   render the optimistic state. A failed or missing response must never lose the action.
2. **Send the event time from the device.** Use an ISO `completedAt` captured at tap time and let
   the backend validate it. Never let the server timestamp replace the real tap time.
3. **Accept only small clock skew.** Backend rejects a time more than 10 minutes in the future
   (`COMPLETION_CLOCK_SKEW_MS`) and accepts any past time. Keep `$setOnInsert` so a retry or a
   double tap keeps the first stored time.
4. **Retry automatically.** Flush on `online`, on `visibilitychange` (visible), and on an interval
   under 60 s. Guard against concurrent flushes with a module-level flag.
5. **Classify failures.** `400`/`404` = permanent, drop the item. `401` or
   `CONSENT_VERSION_OUTDATED` = stop the flush, let the session flow react. Anything else = keep
   and retry.
6. **Merge the queue into the view.** Server data plus queued items, queued wins while the server
   has not caught up. Refresh the list when the queue shrinks.
7. **Undo works offline** while the item is still queued: remove it locally, and only send the
   compensating request when there is a connection.
8. **Date and time come from the phone.** Send `?date=` built with `getDeviceDateKey()` and render
   with `formatTimeFromInstant()`; do not compute timezone offsets in the client.
9. **Clear the queue on unlink/logout** (`clearAll()`), together with token and cache.
10. **Tell the user in plain language**, 20 px or more, using `.senior-offline` / `.senior-notice`
    with `role="status"`. No technical jargon, no spinners without text.

## Checklist

- [ ] Action persisted before the request.
- [ ] Optimistic UI + rollback only on permanent rejection.
- [ ] Event time sent and validated on the backend.
- [ ] Retry triggers: `online`, visibility, interval.
- [ ] Queue merged into the rendered list.
- [ ] Offline and queued notices visible.
- [ ] Queue cleared on unlink/logout.
- [ ] `npm run typecheck` and `npm run build` pass.
