# Win Challenge Generator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) A web application built with Flask and JavaScript to generate custom gaming challenges based on user-provided game win entries and configurable penalties. Manage your wins and penalties locally, generate challenges based on difficulty, and track your progress!

---

## Features

* **Custom Challenge Generation:** Create randomized gaming challenges targeting a specific difficulty level.
* **Parameter Control:** Customize challenges by:
    * Selecting specific games and game modes.
    * Assigning weights to influence game selection probability.
    * Setting minimum player count requirements for included wins.
    * Adjusting the likelihood of back-to-back win requirements within the challenge.
* **Client-Side Data Management:**
    * Manage lists of your game wins (game, mode, difficulty, players) locally using browser `localStorage`.
    * Manage lists of potential penalties (name, probability, description) locally using `localStorage`.
    * Organize both game wins and penalties into user-creatable tabs for different scenarios or games.
* **Default Data Loading:** Load default sets of game entries and penalties from the server database into your local "Default" tabs.
* **User Accounts & Persistence:**
    * Register and log in securely (CSRF protection & Google reCAPTCHA v2).
    * Logged-in users can save/load/delete up to 5 custom tabs (for both games and penalties*) to/from the server, persisting them across sessions/browsers. (*Penalty tab saving/loading/deleting backend API is defined but not yet fully implemented*).
* **Challenge Tracking:**
    * View generated challenges with a clear breakdown of normal vs. back-to-back win requirements.
    * "Accept" challenges to view them on a dedicated page.
    * Track progress against accepted challenges using interactive checkboxes.
    * Use independent timers for each accepted challenge.
* **Modern Backend:** Built with Python and Flask, using the Application Factory pattern and Blueprints for modularity. Uses SQLAlchemy for database interaction.
* **Interactive Frontend:** Uses vanilla JavaScript (ES Modules), `localStorage`, the Fetch API for AJAX, and Bootstrap 4 for styling and components.

---

## Technology Stack

* **Backend:** Python 3, Flask, Flask-Login, Flask-WTF (CSRF), SQLAlchemy, Werkzeug (Password Hashing)
* **Frontend:** HTML, CSS, Bootstrap 4, JavaScript (ES Modules, Fetch API, localStorage)
* **Database:** SQLAlchemy ORM (Defaults to SQLite, configurable via `DATABASE_URL`)
* **Configuration:** Python-dotenv (`.env` file)
* **Templating:** Jinja2

