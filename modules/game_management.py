# modules/game_management.py
from modules.models import GameEntry as Game
from modules.models import  SessionLocal

class GameManager:
    @staticmethod
    def get_all_entries():
        """
        Returns all game entries from the SQL database.
        """
        session = SessionLocal()
        entries = session.query(Game).all()
        session.close()
        # Convert each SQLAlchemy model to a dict if needed.
        # You can add a to_dict() method to your GameEntry model. For example:
        #   def to_dict(self):
        #       return {c.name: getattr(self, c.name) for c in self.__table__.columns}
        return [entry.to_dict() for entry in entries]


    
    @staticmethod
    def add_entry(spiel, spielmodus, schwierigkeit, spieleranzahl):
        """
        Fügt einen neuen Spieleintrag hinzu.
        Parameter:
          spiel: String
          spielmodus: String
          schwierigkeit: Zahl (0-10)
          spieleranzahl: Integer (>= 1)
        Liefert eine Erfolgsmeldung oder löst eine Exception aus.
        """
        if not (spiel and spielmodus and schwierigkeit is not None and spieleranzahl is not None):
            raise ValueError("Alle Felder müssen ausgefüllt werden.")
        try:
            schwierigkeit = float(schwierigkeit)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError
        except ValueError:
            raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        try:
            spieleranzahl = int(spieleranzahl)
            if spieleranzahl < 1:
                raise ValueError
        except ValueError:
            raise ValueError("Spieleranzahl muss eine ganze Zahl und mindestens 1 sein.")
        new_game = Game(
            Spiel=spiel,
            Spielmodus=spielmodus,
            Schwierigkeit=schwierigkeit,
            Spieleranzahl=spieleranzahl
        )
        session = SessionLocal()
        new_entry = Game(
            Spiel=spiel,
            Spielmodus=spielmodus,
            Schwierigkeit=schwierigkeit,
            Spieleranzahl=spieleranzahl
        )
        session.add(new_entry)
        session.commit()
        session.close()
        return "Entry added"

    @staticmethod
    def update_entry(game_id, spiel, spielmodus, schwierigkeit, spieleranzahl):
        """
        Aktualisiert den Spieleintrag an der angegebenen Indexposition.
        Parameter:
          index: Integer, Index des Eintrags
          spiel, spielmodus, schwierigkeit, spieleranzahl: Neue Werte
        Liefert eine Erfolgsmeldung oder löst eine Exception aus.
        """
        session = SessionLocal()
        if not (spiel and spielmodus and schwierigkeit is not None and spieleranzahl is not None):
            raise ValueError("Alle Felder müssen ausgefüllt werden.")
        try:
            schwierigkeit = float(schwierigkeit)
            if not (0 <= schwierigkeit <= 10):
                raise ValueError
        except ValueError:
            raise ValueError("Schwierigkeit muss eine Zahl zwischen 0 und 10 sein.")
        try:
            spieleranzahl = int(spieleranzahl)
            if spieleranzahl < 1:
                raise ValueError
        except ValueError:
            raise ValueError("Spieleranzahl muss eine ganze Zahl und mindestens 1 sein.")
        game = Game.query.get(game_id)
        if not game:
            session.close()
            raise IndexError("Selected entry does not exist.")
        game.Spiel = spiel
        game.Spielmodus = spielmodus
        game.Schwierigkeit = schwierigkeit
        game.Spieleranzahl = spieleranzahl
        session.commit()
        session.close()
        return "Entry updated"

    @staticmethod
    def delete_entry(game_id):
        """
        Deletes the game entry with the given id.
        """
        session = SessionLocal()
        entry = session.query(Game).filter(Game.id == index).first()
        if not entry:
            session.close()
            raise IndexError("No entry selected or entry does not exist.")
        session.delete(entry)
        session.commit()
        session.close()
        return "Entry deleted"


