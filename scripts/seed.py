import os
import sqlite3
import uuid
import random
from datetime import datetime, date, timedelta, time

db_path = os.path.expanduser('~/AppData/Roaming/focus/focus-logs/focus.db')
if not os.path.exists(db_path):
    print(f"Error: Database file not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Task catalog with categories and colors
TASK_TEMPLATES = [
    {"title": "Implement authentication flow", "groupTag": "Backend", "groupColor": "purple", "notes": ["JWT refresh tokens", "OAuth2 callback handling", "Security middleware"]},
    {"title": "Redesign settings dashboard", "groupTag": "Frontend", "groupColor": "emerald", "notes": ["Tab navigation refinement", "Dark mode contrast improvements", "Form keyboard shortcuts"]},
    {"title": "Database indexing & query optimization", "groupTag": "Backend", "groupColor": "purple", "notes": ["Composite index on date and status", "WAL checkpoint tuning", "Profiling slow queries"]},
    {"title": "Design System icon kit & tokens", "groupTag": "Design", "groupColor": "blue", "notes": ["SVG optical size alignment", "Color palette harmony", "Border radius variables"]},
    {"title": "Set up CI/CD GitHub Actions", "groupTag": "DevOps", "groupColor": "rose", "notes": ["Automated typecheck and linting", "Multi-platform test matrix", "Release artifact packaging"]},
    {"title": "Write API documentation & OpenAPI spec", "groupTag": "Docs", "groupColor": "amber", "notes": ["Endpoint schemas", "Request examples", "Error response codes"]},
    {"title": "Refactor timeline performance", "groupTag": "Frontend", "groupColor": "emerald", "notes": ["Virtualizing long session lists", "Memoizing segment calculations", "Layout shift prevention"]},
    {"title": "Customer feedback review & bug triaging", "groupTag": "Planning", "groupColor": "cyan", "notes": ["Categorizing issue backlog", "Priority matrix mapping", "Reproduction steps"]},
    {"title": "Telemetry & crash logging setup", "groupTag": "DevOps", "groupColor": "rose", "notes": ["Safe error serialization", "Log rotation rules", "Debug breadcrumbs"]},
    {"title": "Mobile viewport responsive fixes", "groupTag": "Frontend", "groupColor": "emerald", "notes": ["Flex wrap adjustments", "Touch target hitboxes", "Sidebar drawer transitions"]},
]

BREAK_TEMPLATES = [
    {"text": "Break", "note": "Coffee & fresh air break"},
    {"text": "Break", "note": "Quick lunch & walk"},
    {"text": "Break", "note": "Stretching & hydration"},
    {"text": "Break", "note": "Afternoon tea break"},
]

OTHER_TEMPLATES = [
    {"text": "Daily team standup & check-in", "note": "Discussing blocker resolutions and sprint goals"},
    {"text": "Email & communication triage", "note": "Clearing inbox and responding to vendor questions"},
    {"text": "Tech spec & architecture research", "note": "Exploring SQLite concurrent read patterns"},
    {"text": "Sprint retrospective & planning", "note": "Reviewing velocity metrics and backlog grooming"},
    {"text": "Peer code review & PR feedback", "note": "Reviewing data layer PR and leaving comments"},
]

# Year to seed: Jan 1, 2026 to Oct 27, 2026
start_date = date(2026, 1, 1)
end_date = date(2026, 10, 27)

# We want to keep today's (Oct 27) real logs that the user created!
# Let's delete existing dummy logs for previous dates if re-run, but preserve today (2026-10-27)
cur.execute("DELETE FROM logs WHERE date < '2026-10-27'")
cur.execute("DELETE FROM daily_goals WHERE date < '2026-10-27'")

current_date = start_date
total_goals_created = 0
total_logs_created = 0

random.seed(42)  # Deterministic seed for reproducible testing data

while current_date < end_date:
    date_str = current_date.isoformat()
    is_weekend = current_date.weekday() >= 5

    # Determine if this day should have activity
    has_activity = (random.random() < 0.35) if is_weekend else (random.random() < 0.90)

    if has_activity:
        # Choose 2 to 4 tasks for this day
        num_goals = random.randint(1, 2) if is_weekend else random.randint(2, 4)
        day_tasks = random.sample(TASK_TEMPLATES, num_goals)

        created_goals = []
        for task in day_tasks:
            goal_id = str(uuid.uuid4())
            target_mins = random.choice([30, 45, 60, 90, 120])
            status = 'done' if random.random() < 0.80 else 'in_progress'
            created_at = datetime.combine(current_date, time(random.randint(8, 10), random.randint(0, 50))).isoformat() + 'Z'
            completed_at = datetime.combine(current_date, time(random.randint(16, 18), random.randint(0, 50))).isoformat() + 'Z' if status == 'done' else None

            cur.execute("""
                INSERT INTO daily_goals (
                    id, date, title, status, targetMinutes, createdAt, completedAt, groupTag, groupColor, sortOrder, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                goal_id, date_str, task["title"], status, target_mins,
                created_at, completed_at, task["groupTag"], task["groupColor"],
                len(created_goals) + 1, created_at
            ))
            total_goals_created += 1
            created_goals.append({
                "id": goal_id,
                "title": task["title"],
                "notes": task["notes"]
            })

        # Generate continuous timeline sessions for the day
        # Start between 9:00 AM and 9:30 AM
        current_time = datetime.combine(current_date, time(random.randint(9, 10), random.choice([0, 15, 30])))
        end_work_hour = 17 if is_weekend else random.choice([17, 18, 19])

        # Sequence: task -> break -> task -> other -> task -> ...
        session_idx = 0
        while current_time.hour < end_work_hour:
            session_idx += 1
            roll = random.random()

            if roll < 0.60 and created_goals:
                # Task session
                target_goal = random.choice(created_goals)
                duration = random.choice([25, 30, 40, 45, 50, 60])
                started_at = current_time
                ended_at = current_time + timedelta(minutes=duration)
                note = random.choice(target_goal["notes"])

                cur.execute("""
                    INSERT INTO logs (
                        id, timestamp, text, startedAt, endedAt, goalId, goalTitle, note, productivity, durationMinutes, productiveMinutes, date, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(uuid.uuid4()), ended_at.isoformat() + 'Z', target_goal["title"],
                    started_at.isoformat() + 'Z', ended_at.isoformat() + 'Z',
                    target_goal["id"], target_goal["title"], note, 'productive',
                    float(duration), float(duration), date_str, ended_at.isoformat() + 'Z'
                ))
                total_logs_created += 1
                current_time = ended_at

            elif roll < 0.80:
                # Break session (Red)
                b = random.choice(BREAK_TEMPLATES)
                duration = random.choice([10, 15, 20, 30])
                started_at = current_time
                ended_at = current_time + timedelta(minutes=duration)

                cur.execute("""
                    INSERT INTO logs (
                        id, timestamp, text, startedAt, endedAt, note, productivity, durationMinutes, productiveMinutes, date, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(uuid.uuid4()), ended_at.isoformat() + 'Z', b["text"],
                    started_at.isoformat() + 'Z', ended_at.isoformat() + 'Z',
                    b["note"], 'break', float(duration), 0.0, date_str, ended_at.isoformat() + 'Z'
                ))
                total_logs_created += 1
                current_time = ended_at

            else:
                # Other session (Yellow / Amber)
                oth = random.choice(OTHER_TEMPLATES)
                duration = random.choice([15, 20, 25, 30])
                started_at = current_time
                ended_at = current_time + timedelta(minutes=duration)

                cur.execute("""
                    INSERT INTO logs (
                        id, timestamp, text, startedAt, endedAt, note, productivity, durationMinutes, productiveMinutes, date, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(uuid.uuid4()), ended_at.isoformat() + 'Z', oth["text"],
                    started_at.isoformat() + 'Z', ended_at.isoformat() + 'Z',
                    oth["note"], 'productive', float(duration), float(duration), date_str, ended_at.isoformat() + 'Z'
                ))
                total_logs_created += 1
                current_time = ended_at

    current_date += timedelta(days=1)

conn.commit()
conn.close()

print(f"Successfully populated database!")
print(f"Total goals created: {total_goals_created}")
print(f"Total session logs created: {total_logs_created}")
