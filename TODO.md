1. PLANNING

- in planner, user creates tasks in "planned" section
- if user is doing that task, then puts that task into "in progress" section
- if task is completed, user puts task into "completed" section

in planned section:

- show all tasks which are due, even their due date is passed (then showed as red)
- tasks without any due date stay in planned section until scheduled or moved
- if a task has an exact deadline time (e.g. 3:00 PM today), show as red immediately once that time passes
- if user updates date of overdue task to today or carries it, red status clears immediately

in progress section:

- show all tasks which are "in progress" from past or added by user today
- if multiple tasks are in progress:
  - top-most task is tracked by the session timer by default
  - user can reorder tasks in progress to switch which task is actively focused
  - user can click any in-progress task to set it as active focus
- if user moves active task back to "planned" mid-session:
  - session timer stops immediately
  - if user worked at least 1 minute, auto-log partial time to today's timing, or discard if less than 1 minute
  - if another task is still in progress, session timer automatically switches to next task and starts
- if user moves active task directly to "completed" mid-session:
  - session timer stops for that task
  - elapsed time worked is logged to today's timing
  - if another task is still in progress, new session timer starts on next task
- if user deletes active task, timer stops cleanly and switches to next in-progress task if available
- if in-progress section becomes empty (0 tasks), timer stops and waits in idle

in completed section:

- show only tasks which are added today into completed section
- older completed section will be shown only in review tab
- if user works past midnight (e.g. 1:00 AM) before day cutoff hour (default 4:00 AM), completed tasks stay in today's completed section
- if user accidentally moves a task to completed and drags it back to in progress or planned, completed status clears and timer resumes if back in progress
- in review tab, user can view past days' completed tasks and click "Reopen / Move to Today" if needed

2. WORK

- if any task is in "in progress" section, start session timer of session timing (default is 45 min)
  - starts ambient white noise / music if enabled
  - updates desktop widget, mini player, and taskbar progress bar
  - if multiple tasks in progress, focuses the top task

- during 45 min session:
  - user can manually pause:
    - ambient music pauses
    - if pause lasts more than 40 seconds, count paused time as red break in today's timing so focus hours are not inflated
    - when resumed, countdown continues from remaining time (with audio fade-in)
  - user can take manual break button:
    - saves focus time worked so far to today's timing
    - starts break timer in red
  - user can click "+5 min" to extend current session
  - if laptop lid closes or system sleeps:
    - delta timer detects sleep duration and subtracts away time (never counts computer sleep as work or triggers spam prompts)
  - if screen is locked (Win+L / Mac lock):
    - timer pauses and lock duration counts as break

- when session timing ends (45 min reached):
  - play session complete chime sound
  - pause ambient white noise so prompt and chime are heard
  - prompt window appears on active monitor (where user cursor is)
  - 500ms keypress debounce prevents accidental submission if user is actively typing
  - background timer pauses at 00:00 (does not run runaway overtime)

- when prompt appears:

  a. if user chooses tasks from "in progress":
  - adds start to end timing to today's timing as group color or green as default
  - user can add optional description/note
  - prompt offers quick checkbox: "Mark task as completed" to move task to completed section without manual dragging
  - if user worked on a different in-progress task than original, picking it logs to that task and sets it active for next session
  - new session timer starts from starting (45 min)

  b. if user chooses "something else":
  - user enters description of work done (description is mandatory, cannot be empty)
  - adds start to end timing to today's timing as description in yellow color
  - prompt offers optional checkbox: "Add as task to planner" so spontaneous work is captured
  - new session timer starts from starting (45 min)

  c. if user chooses "break":
  - adds start to end timing of break to today's timing as red color
  - new session timer starts from starting (45 min)

  d. if user chooses "snooze":
  - start session timer from starting (45 min)
  - shows snooze counter badge (e.g. "Snoozed 1x")
  - work done in current session continues smoothly

  e. if user is afk after prompt appears:
  - wait 40 seconds showing countdown badge ("AFK in 40s", "39s"...)
  - any mouse move, click, or keypress resets countdown back to 40 seconds
  - pre-prompt idle detection: if user was already idle before prompt appeared (e.g. left at minute 20 of 45), count idle portion as break instead of phantom focus
  - when 40 seconds pass with no activity:
    - automatically saves completed 45-minute focus session to today's timing (preserving user's work)
    - prompt window switches to red AFK break screen
    - red timer starts from 00:00 and counts up break seconds
    - ambient white noise pauses automatically
    - desktop widget and taskbar switch to red break display
  - when user returns from AFK:
    - user clicks "I'm Back — Start Focus Session" (or presses Enter / Space)
    - if break was less than 1 minute, discard trivial break to keep timeline clean
    - otherwise, adds total break time (40s wait + AFK time) to today's timing as red color
    - resumes ambient white noise with smooth fade-in
    - new session timer starts from starting (45 min) on in-progress task
    - if no tasks remain in progress, notify user to move a task to in progress to start focusing

- now, new session timer starts from starting in all cases
