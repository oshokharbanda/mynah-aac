export function CaregiverCredits({ onClose }: { onClose: () => void }) {
  return (
    <main className="caregiver-screen">
      <header className="caregiver-header">
        <p className="eyebrow">CAREGIVER TOOLS</p>
        <h1>Credits</h1>
      </header>

      <section className="credits-card" aria-labelledby="symbol-credits">
        <h2 id="symbol-credits">Picture symbols</h2>
        <p>
          Mynah uses ARASAAC pictograms created by Sergio Palao. They are included
          on this device so the board can work offline.
        </p>
        <p>
          ARASAAC symbols are licensed under Creative Commons Attribution-
          NonCommercial-ShareAlike 4.0 International.
        </p>
        <a
          href="https://arasaac.org"
          target="_blank"
          rel="noreferrer"
        >
          Visit ARASAAC
        </a>
      </section>

      <button className="caregiver-back" type="button" onClick={onClose}>
        Back to board
      </button>
    </main>
  );
}
