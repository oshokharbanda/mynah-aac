import { voiceOptions, type VoiceId } from "@/app/lib/audio-voices";

export function CaregiverCredits({
  onClose,
  selectedVoice,
  onChangeVoice,
  onPreviewVoice,
}: {
  onClose: () => void;
  selectedVoice: VoiceId;
  onChangeVoice: (voice: VoiceId) => void;
  onPreviewVoice: (voice: VoiceId) => void;
}) {
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

      <section className="credits-card" aria-labelledby="voice-choice">
        <h2 id="voice-choice">Board voice</h2>
        <p>Choose the voice that feels right for your child. It stays on this device.</p>
        <div className="voice-options">
          {voiceOptions.map((voice) => (
            <div className="voice-option" key={voice.id}>
              <button
                className="voice-select"
                type="button"
                aria-pressed={selectedVoice === voice.id}
                onClick={() => onChangeVoice(voice.id)}
              >
                {voice.label}
              </button>
              <button className="voice-preview" type="button" onClick={() => onPreviewVoice(voice.id)}>
                Preview
              </button>
            </div>
          ))}
        </div>
      </section>

      <button className="caregiver-back" type="button" onClick={onClose}>
        Back to board
      </button>
    </main>
  );
}
