# Exam Platform

A full-stack online exam portal built with Next.js 14, Firebase, and Tailwind CSS. Designed for conducting timed MCQ exams with admin management, secure server-side scoring, and real-time student tracking.

## Features

### Admin
- Create and manage tests (title, duration, passing marks, ending mode)
- Create student accounts with username/password login
- Import questions in bulk via JSON
- Manage sections and questions per test
- View all submissions and detailed results per student
- Publish/unpublish tests
- Copy shareable test links

### Student
- Username-based login (no email required)
- Take timed exams with a live countdown timer
- Exam session persists on page refresh — no lost progress
- "Exam In Progress" gate prevents re-taking or resetting mid-exam
- Per-question time tracking
- Mobile-responsive UI with collapsible question navigator sidebar
- View detailed results after submission

### Scoring
- Server-side scoring only — correct answers are never sent to the client
- Supports +4 / −1 (negative marking) or custom marks per question
- Optional sections: set an `attemptLimit` so only the best N answers in a section are scored (real NEET pattern)
- Overtime mode: timer turns purple and continues counting after time is up instead of auto-submitting

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | Firebase Authentication |
| Database | Firebase Firestore |
| Hosting | Vercel |
| Admin SDK | firebase-admin (server-side scoring) |

---

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd exam-platform
npm install
```

### 2. Set up Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** (Email/Password provider)
3. Enable **Firestore Database**
4. Generate a **service account key** (Project Settings → Service Accounts → Generate new private key)

### 3. Configure environment variables

Create a `.env.local` file in the root:

```env
# Firebase client config (from Project Settings → General → Your apps)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (from service account JSON)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. First-time setup

Visit `/setup` to create the first admin account. This route is disabled once an admin exists.

---

## Project Structure

```
app/
├── login/                  # Student & admin login
├── dashboard/              # Student dashboard (lists available tests)
├── test/[testId]/          # Exam taking page
├── results/[submissionId]/ # Results page after submission
├── setup/                  # First-run admin creation
├── admin/
│   ├── page.tsx            # Admin dashboard
│   ├── tests/              # Test list, create, manage (sections/questions/import)
│   ├── students/           # Create and manage student accounts
│   └── submissions/        # View all submissions and individual results
└── api/
    ├── submit-test/        # Secure server-side scoring endpoint
    ├── test/[testId]/questions/  # Serves questions without correct answers
    ├── results/[submissionId]/   # Fetch result data
    └── admin/              # Create/delete student accounts

components/
├── Timer.tsx               # Live exam countdown timer
└── AdminSidebar.tsx        # Admin navigation

lib/
├── types.ts                # Shared TypeScript types
├── firebase.ts             # Firebase client initialisation
├── firebase-admin.ts       # Firebase Admin SDK (lazy init)
└── utils.ts                # Helpers (formatSeconds, formatDuration, etc.)
```

---

## Importing Questions (JSON)

From the admin panel, go to **Tests → [Your Test] → Import JSON**.

The JSON schema:

```json
{
  "sections": [
    {
      "title": "Physics - Section A",
      "description": "Attempt all 45 questions.",
      "questions": [
        {
          "type": "single",
          "text": "Question text here",
          "options": [
            { "id": "a", "text": "Option A" },
            { "id": "b", "text": "Option B" },
            { "id": "c", "text": "Option C" },
            { "id": "d", "text": "Option D" }
          ],
          "correctAnswers": ["a"],
          "marks": 4,
          "negativeMarks": 1,
          "explanation": "Optional explanation shown after submission."
        }
      ]
    },
    {
      "title": "Physics - Section B",
      "description": "Attempt any 10 of 15 questions.",
      "attemptLimit": 10,
      "questions": []
    }
  ]
}
```

**Field reference:**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Section name |
| `description` | string | No | Shown to students |
| `attemptLimit` | number | No | Score only the best N answers in this section |
| `type` | `"single"` \| `"multiple"` \| `"true-false"` | Yes | Question type |
| `correctAnswers` | string[] | Yes | Array of correct option IDs |
| `marks` | number | Yes | Marks awarded for correct answer |
| `negativeMarks` | number | No | Marks deducted for wrong answer (default 0) |

A ready-made **180-question NEET exam** file is included: `neet-full-exam.json`
(Physics, Chemistry, Biology — each with Section A compulsory + Section B attempt-any-10-of-15)

---

## Ending Modes

| Mode | Behaviour |
|---|---|
| `immediate` | Exam auto-submits when timer reaches zero |
| `negative` | Timer goes into overtime (shown in purple); student can still submit |

---

## Marking Scheme

- Correct answer: `+marks` (e.g. +4)
- Wrong answer: `−negativeMarks` (e.g. −1)
- Unanswered: 0
- For sections with `attemptLimit`: if a student answers more than the limit, only the **best N answers** (by marks obtained) are counted. Excess answers are excluded automatically.

---

## Deployment (Vercel)

1. Push to GitHub
2. Connect repo to [vercel.com](https://vercel.com)
3. Add all environment variables from `.env.local` in the Vercel dashboard
4. Deploy — Vercel handles the Next.js build automatically
