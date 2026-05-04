# Campus Clearout

Campus Clearout is a student marketplace web application built for University at Buffalo students.
It enables verified .edu users to buy, sell, and trade items like textbooks, dorm supplies, and campus gear with built-in messaging, saved listings, and an authenticated storefront experience.

## Features

- UB student-only authentication with email verification
- Browse and search campus marketplace listings
- Save favorites for later
- Create and manage listings and bundles
- In-app messaging and unread message notifications
- Secure protected routes for profile, settings, and inbox
- Responsive React front-end with PHP-based API backend support

## Tech Stack

- React 19
- React Router DOM 7
- Create React App
- PHP backend API endpoints under `src/api/`
- Hash-based client routing for static hosting compatibility

## Project Structure

- `src/App.js` — main routing, auth guard, unread message polling
- `src/Components/` — core UI views and reusable components
- `src/api/` — backend PHP endpoint scripts
- `public/` — static HTML and manifest files
- `build/` — production output after `npm run build`

## Getting Started

### Requirements

- Node.js and npm
- PHP backend available for the API routes used by the front-end

### Install dependencies

```bash
npm install
```

### Run development server

```bash
npm start
```

Then open `http://localhost:3000`.

### Build for production

```bash
npm run build
```

The production-ready files will be generated in the `build/` folder.

## Notes

- The app authenticates users with local storage tokens and expects API calls to endpoints like `/CSE442/2026-Spring/cse-442s/api/*`.
- Protected routes redirect unauthenticated users to the login/signup flow.
- Unread message polling and notification sound are handled in `src/App.js`.

## Recommended Workflow

1. Start the front-end with `npm start`
2. Ensure the PHP API backend is running and reachable
3. Sign up or log in from the landing page
4. Create listings, save favorites, and use the inbox for messaging

## License

This repository does not include a license file. Add one if you want to open source the project.
