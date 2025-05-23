# Winchallenge Generator
# Win Challenge Generator

Ein Python-Projekt, das einen Win Challenge Generator mit einer intuitiven grafischen Benutzeroberfläche (GUI) erstellt. Mit diesem Tool kannst du Einträge für verschiedene Spiele, Spielmodi, Schwierigkeitsgrade und Spieleranzahlen verwalten und daraus zufällige Win Challenges generieren.

## Features

- **Eintrag verwalten:**  
  - Neue Einträge (Spiel, Spielmodus, Schwierigkeit, Spieleranzahl) hinzufügen.
  - Vorhandene Einträge per Doppelklick in der Übersicht bearbeiten und aktualisieren.
  
- **Challenge Generator:**  
  - Erstelle zufällige Win Challenges aus den vorhandenen Einträgen.
  - Filtere Einträge nach Spieleranzahl und optional nach ausgewählten Spielen.
  - Generiere Segmente mit *Normal Wins* (einzelne Spiele) und *Back-to-Back Wins* (mehrere Spiele in Folge).
  - Berechne die Schwierigkeit von Back-to-Back Segmenten mit einer ansteigenden Formel (z. B. Multiplikation mit `1.5^(n-1)`).

- **CSV-Datenbank:**  
  Alle Einträge werden in einer CSV-Datei gespeichert, die einfach weitergegeben oder per E-Mail verschickt werden kann.

- **Grafische Benutzeroberfläche (Tkinter):**  
  Eine übersichtliche und leicht bedienbare GUI zur Verwaltung der Einträge und zur Generierung von Challenges.

## Installation

1. **Voraussetzungen:**  
   - Python 3.x (getestet mit Python 3.8+)
   - Tkinter (in der Regel standardmäßig in Python enthalten)

2. **Repository klonen:**

   ```bash
   git clone https://github.com/FKammerer45/WinchallengeGenerator.git
   cd WinchallengeGenerator
