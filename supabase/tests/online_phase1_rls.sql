begin;
select plan(5);
select has_table('public', 'employees', 'employees exists');
select has_table('public', 'work_schedules', 'work schedules exists');
select has_table('public', 'schedule_adjustments', 'adjustments exists');
select has_table('public', 'attendance', 'attendance exists');
select policies_are('public', 'employees', array['employees_read','employees_write'], 'employees RLS policies are explicit');
select * from finish();
rollback;
