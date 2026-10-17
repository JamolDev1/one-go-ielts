# One-Go IELTS Exam Portal

A GitHub Pages frontend for a three-section exam using the supplied Listening and Reading HTML files, followed by a Writing section. Student submissions are stored in Supabase with row-level security. The teacher dashboard exports each submission as a `.docx` Word file.

## Included
- `index.html`: username/password login and the timed student flow.
- `tests/Listening.html`, `tests/Reading.html`: supplied test content in exam mode.
- `admin.html`: private dashboard and Word export.
- `supabase-setup.sql`: database tables and access policies.
- `config.js`: project URL and public anon key placeholders.

## Important limitations
- GitHub Pages hosts static files only. Supabase is required for real authentication and private storage. Do not put a Supabase `service_role` key in this repository.
- The test HTML you provided had answer keys in browser JavaScript. They have been removed from the client-side files here. This starter saves responses, not automatically graded scores; teacher review/marking is needed.
- Browser-only restrictions cannot make a high-stakes exam cheat-proof. A determined student can use another device, and GitHub Pages cannot enforce kiosk mode. For formal exams, use managed devices or a proctoring platform.
- The Listening page uses the audio URL already referenced in your uploaded file. Check that you have the right to use that audio and that the URL is still available.
- The one-way audio controls are disabled in the exam page. Browser/OS-level recording or network interruption cannot be fully prevented by a static website.
- Draft answers are saved in the student's browser during the session. If online submission fails, a JSON recovery file downloads at the end; the student must send it to the teacher.

## 1. Create Supabase backend
1. Create a project at https://supabase.com.
2. Open **Project Settings → API** and copy the Project URL and `anon`/publishable key.
3. In **Authentication → Providers → Email**, turn off email confirmations for this username/password classroom setup. Use strong temporary passwords and change them when needed.
4. Open **SQL Editor**, paste and run `supabase-setup.sql`.
5. In **Authentication → Users**, create each student with an email such as `jamoliddin@students.exam.local` and a password. Set user metadata `username` to the login name if the dashboard allows it; otherwise the profile username is taken from the part before `@`.
6. Create your teacher account similarly, e.g. `teacher@students.exam.local`.
7. In SQL Editor, promote the teacher account (replace `teacher` with its username):
   ```sql
   update public.profiles set role = 'admin' where username = 'teacher';
   ```
8. Edit `config.js` and replace the URL and anon key placeholders. The anon key is public by design; database security comes from RLS policies. Never use the service-role key here.

## 2. Publish with GitHub Pages
1. Create a GitHub repository, e.g. `one-go-ielts`.
2. Upload all files and the `tests` folder, keeping the structure unchanged.
3. In repository **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Open the published Pages URL. Test with a student account first, then the teacher account.

## Student flow
- Sign in with username + password.
- Listening: 30 minutes; audio cannot be paused/rewound from the page.
- Reading: 60 minutes; the section locks when time expires.
- Writing: 60 minutes for Task 1 and Task 2.
- At the end, responses are submitted to Supabase. Students do not see results.

## Teacher results
Sign in using the teacher account. It is redirected to `admin.html`. Download any student's submission as a Word `.docx` document. The document includes collected answers and both writing responses.

## Before using with a real class
- Run a complete test submission on desktop and mobile.
- Verify that the Listening audio begins correctly and lasts as expected.
- Confirm that the teacher account is marked `admin` and student accounts are marked `student`.
- Keep the repository private if you don't want the test content publicly browsable; remember that GitHub Pages availability and repository visibility depend on your GitHub plan/settings.
