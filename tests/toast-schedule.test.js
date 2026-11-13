const test = require('node:test');
const assert = require('node:assert/strict');
const toast = require('../lib/toast-schedule.js');

test('autoDismissMsForKind', () => {
  assert.equal(toast.autoDismissMsForKind('success'), 2000);
  assert.equal(toast.autoDismissMsForKind('error'), 0);
});

test('scheduleSuccess only runs latest generation', async () => {
  const sched = toast.createToastDismissScheduler(30);
  let runs = 0;
  sched.scheduleSuccess(() => { runs += 1; });
  sched.cancelAndBump();
  sched.scheduleSuccess(() => { runs += 1; });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(runs, 1);
});
