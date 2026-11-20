# SMOG · woorden indelen

Een Nederlandstalige browserapp om de woorden uit `SMOG_woordenlijst_basis.pdf` in drie persoonlijke niveaus te verdelen. De voorgestelde startindeling is een interpretatie voor dagelijks contact met een kindje van 1 jaar; pas die gerust aan op jullie eigen routines.

## Gebruiken

Open `index.html` in een browser. De prentjes met de gedrukte en handgeschreven uitleg staan direct op de kaartjes. Houd `SMOG_woordenlijst_basis.pdf` in dezelfde map om ook de volledige bronpagina te openen. Verplaats woorden door ze naar een ander niveau te slepen, of kies het niveau op het kaartje. De indeling wordt automatisch in die browser bewaard.

Met **Download indeling** kun je een reservekopie maken. **Indeling openen** laadt die kopie later weer in.

## Host als container

```powershell
docker build -t smog-project .
docker run --rm -p 8080:8080 smog-project
```

Open daarna `http://localhost:8080`. De GitHub Actions-workflow publiceert de container naar GitHub Container Registry bij een push naar `main` of handmatig starten van de workflow.