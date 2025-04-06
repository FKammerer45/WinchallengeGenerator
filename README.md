# Win Challenge Generator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A web application built with Flask and JavaScript to generate custom gaming challenges. Configure your game win history and penalties locally, generate complex challenges based on target difficulty, share challenges with friends (if logged in), track progress collaboratively or solo, and spin the penalty wheel!

---

## Key Features

* **Custom Challenge Generation:**
    * Create randomized gaming challenges targeting a specific difficulty level.
    * Select included games and optionally filter by specific game modes.
    * Assign weights to games to influence selection probability.
    * Adjust the likelihood of back-to-back win requirements.
* **Client-Side Data Management:**
    * Manage lists of your game wins (game, mode, difficulty estimate, player count) in your browser's `localStorage`.
    * Manage lists of potential penalties (name, probability, description) in `localStorage`.
    * Organize game wins and penalties into user-creatable tabs within `localStorage`.
* **User Accounts & Sharing:**
    * Optional user registration and login (Flask-Login, password hashing).
    * Google reCAPTCHA v2 protection on registration/login.
    * Change password and delete account functionality.
    * **Sharing (Logged-in Users):**
        * Generate and save challenges to the database, creating a unique shareable URL.
        * Limit of active shared challenges per user (e.g., 10).
        * Optionally set a name and maximum number of groups for shared challenges.
    * **Local Challenges (Anonymous & Logged-in Users):**
        * Generate challenges saved *only* to the browser's `localStorage`.
        * Access local challenges via a specific link (not shareable with others).
* **Challenge Modes & Interaction:**
    * **Single Group Mode:** Default for local challenges and can be selected for shared challenges (max_groups=1). Progress tracked individually.
    * **Multigroup Mode (Shared Challenges):**
        * Allows multiple groups (up to the defined maximum) to join via the shared link.
        * Users can create/join/leave groups.
        * Progress is tracked separately per group.
        * Users can only update progress for the group they have joined.
    * **Player Name Management (Multigroup):** Users within a joined group can add/edit/remove player names associated with their group (up to the limit set during challenge creation).
* **Progress Tracking:**
    * Interactive checkboxes on the challenge view page to mark wins/segments as complete.
    * Progress saved automatically (to database for shared challenges, to localStorage for local challenges).
    * Visual progress bar showing overall completion.
* **Penalties (Optional):**
    * If enabled during generation, a "Lost Game" button appears on the challenge view page (only for joined users in multigroup mode).
    * Clicking the button spins a wheel to randomly select a participant (using saved player names for the joined group if available, otherwise defaults) and then spins another wheel to assign a weighted random penalty from the configured list.
* **My Challenges Page:**
    * Lists all shared challenges created by the logged-in user.
    * Lists all locally saved challenges for any user (logged-in or anonymous).
    * Provides links to view challenges.
    * Allows logged-in users to delete their shared challenges from the database.
    * Allows any user to delete locally saved challenges from their browser.

---

## Technology Stack

* **Backend:** Python 3, Flask, SQLAlchemy (ORM), Flask-Login, Flask-WTF (CSRF/Forms), Flask-Migrate (Database Migrations), Werkzeug (Password Hashing), python-dotenv
* **Frontend:** HTML5, CSS3, Bootstrap 4 (v4.5.2 - requires jQuery), JavaScript (Vanilla ES Modules, Fetch API, localStorage), Winwheel.js (for optional penalty wheel), GSAP (TweenMax) (for optional penalty wheel animation)
* **Database:** SQLAlchemy supports multiple backends (Default configured for SQLite, tested with MySQL). Uses Alembic via Flask-Migrate.
* **Other:** Google reCAPTCHA v2

---

## Setup & Installation

1.  **Clone the Repository:**
    ```bash
    git clone <your-repo-url>
    cd winchallange-generator
    ```
2.  **Create Virtual Environment:**
    ```bash
    python -m venv venv
    # Activate (Windows)
    .\venv\Scripts\activate
    # Activate (Linux/macOS)
    source venv/bin/activate
    ```
3.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
    *(Ensure you have a `requirements.txt` file)*
4.  **Environment Variables:**
    * Create a `.env` file in the project root (where `run.py` is).
    * Add the following variables:
        ```dotenv
        FLASK_APP=run.py
        FLASK_DEBUG=1 # Set to 0 for production
        SECRET_KEY='your_very_secret_random_key_here' # CHANGE THIS! Generate a strong random key.
        DATABASE_URL='sqlite:///../instance/app.db' # Default SQLite in instance folder
        # Or for MySQL: DATABASE_URL='mysql+pymysql://user:password@host/db_name'
        # RECAPTCHA_PUBLIC_KEY='your_recaptcha_site_key' # Optional: If using reCAPTCHA
        # RECAPTCHA_PRIVATE_KEY='your_recaptcha_secret_key' # Optional: If using reCAPTCHA
        # MAX_CHALLENGES_PER_USER=10 # Optional: Override default limit
        ```
    * Replace placeholder values, especially `SECRET_KEY`.
5.  **Database Setup:**
    * The first time, initialize the database and apply migrations:
        ```bash
        flask db init # Only if you haven't initialized Alembic before
        flask db migrate -m "Initial database schema" # Or a descriptive message
        flask db upgrade # Apply the migrations to create tables
        ```
    * For subsequent model changes, run `flask db migrate` and `flask db upgrade`.
6.  **Run the Application:**
    ```bash
    py run.py
    # OR
    flask run
    ```
7.  Access the application in your browser, usually at `http://127.0.0.1:5000`.

---

## Usage

1.  **Configure (Optional but Recommended):** Navigate to the "Games" and "Penalties" pages to add your game win history and define custom penalties using different tabs.
2.  **Generate:** Go to the "Home" page (Generator).
    * Select your desired Game and Penalty source tabs.
    * Choose "Single Group (Local)" or "Multigroup (Shared)" mode.
    * Set parameters (Player Count, Difficulty, B2B Probability).
    * Select the Games/Modes to include and adjust weights.
    * Click "Generate Challenge".
3.  **View/Interact:**
    * **Local:** Click "View Locally Saved Challenge". Track progress (saved to localStorage).
    * **Shared (Logged-in):** Click "Share Challenge". This saves it to the database and provides a shareable link. Open the link to view. If Multigroup, create/join a group. Track progress (saved to database). Manage player names for your group. Click "Lost Game" if penalties are enabled.
4.  **My Challenges:** Visit this page to see your saved local challenges and (if logged in) your shared database challenges. View or delete them.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details (or assume standard MIT if file not present).