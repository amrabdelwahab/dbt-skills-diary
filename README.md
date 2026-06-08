# DBT Skills Diary

A daily, phone-friendly version of the DBT Skills Diary Card (Linehan / Behavioral Tech).
Tap the 31 skills you practiced, rate how much skills helped (0–7), add notes, and send the
day to your therapist with one tap (WhatsApp or email). Every day is saved and browsable in
the archive.

**Your entries live only on your device** (in the browser's local storage). The deployed
website never stores or sees them — they leave your phone only when *you* press WhatsApp/Email.
The passcode locks the app on your phone; the "backup" file is how you move data to a new phone.

---

## How to use (daily)

1. Open the app (bookmark it / add to home screen).
2. Tap the skills you used today; set the 0–7 rating; jot notes.
3. Tap **WhatsApp** (or **Email**) → pick your therapist → send.

First-time setup, via the **⋯** menu:
- **Set therapist's WhatsApp number** (country code + number) and/or **email**.
- **Set passcode** to lock the app.
- **Add daily reminder** → downloads a calendar file; opening it adds a repeating 8pm reminder
  (you can change the time in your calendar app).
- **Export backup / Restore** → save all days to a file, or load them onto a new phone.

Use **🗂️ Archive** in the menu to see every past day; tap any day to view or re-send it.
The **‹ ›** arrows at the top step between days.

---

## Deploy it to a free URL (GitHub Pages)

1. Create a new GitHub repo and push these files (`index.html`, `README.md`, `.github/`).
   ```bash
   git init -b main
   git add .
   git commit -m "DBT skills diary"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow deploys on every push. Your URL will be
   `https://<you>.github.io/<repo>/`.
4. Open it on your phone → browser menu → **Add to Home screen**.

### About "password protection"
GitHub Pages is a static host with no server-side login, so the real protection is the
**in-app passcode** (Settings → Set passcode), which gates the app and your saved entries on
the device. If you also want the *URL itself* to be unguessable, use a private repo with a
random repo name, or put the site behind Cloudflare Access (free tier) for a true login wall.
Tell me which and I can wire it up.
