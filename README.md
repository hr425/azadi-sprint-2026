# 🇮🇳 AZADI SPRINT 2026 — Independence Quiz

A simple live 8-question Independence Day quiz website.

## What is included

- Landing page with Independence Day theme
- Host login restricted to:
  - Sejal T
  - Chandni M
- Participant login using participant name
- Host "Start Session" control
- Live synchronized questions
- 15-second countdown for every question
- No multiple-choice options
- Participants can submit only once per question
- Server records answers in first-to-last submission order
- Automatic progression through all 8 questions
- Participant finale: "Jai Hind! Thank you for playing. Winners will be declared soon."
- Host live answer-order view
- Final answer sheet with every question, participant, answer and timestamp
- Print / Save as PDF button for the host results

## Run it

1. Install Node.js (LTS).
2. Open a terminal in this project folder.
3. Run:

   npm install
   npm start

4. Open:

   http://localhost:3000

For a real office event, deploy the Node app to a service that supports WebSockets (for example Render, Railway, Fly.io, or a VPS).

## Important

This is intentionally a lightweight event application. The current host authentication is based on the two approved host names. For a production deployment, add a host password/PIN or proper authentication so another person cannot impersonate a host by selecting a host name.

The session data is stored in server memory. This is suitable for one live event on one server, but it is not intended as a permanent database.

## Easy customizations

- Edit the `QUESTIONS` array in `server.js` to change the 8 questions.
- Change the authorized host names in `HOSTS`.
- Change the event title and wording in `public/index.html`.
- Change colors and styling in `public/style.css`.
