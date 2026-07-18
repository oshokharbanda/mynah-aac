import { attentionPhrase, notThatPhrase, urgentPhrases } from "@/app/lib/quick-phrases";
import type { StoredUtterance } from "@/app/lib/tile-usage";

export function CommunicationTools({
  recentUtterances,
  onSpeakPhrase,
  onReplay,
}: {
  recentUtterances: readonly StoredUtterance[];
  onSpeakPhrase: (phraseId: string) => void;
  onReplay: (utterance: StoredUtterance) => void;
}) {
  return (
    <section className="communication-tools" aria-label="Quick communication">
      <div className="attention-actions">
        <button
          className="attention-button"
          type="button"
          onClick={() => onSpeakPhrase(attentionPhrase.id)}
        >
          {attentionPhrase.label}
        </button>
        <button
          className="not-that-button"
          type="button"
          onClick={() => onSpeakPhrase(notThatPhrase.id)}
        >
          {notThatPhrase.speech}
        </button>
      </div>

      <div className="urgent-phrases" aria-label="Urgent phrases">
        {urgentPhrases.map((phrase) => (
          <button
            className="urgent-phrase"
            key={phrase.id}
            type="button"
            onClick={() => onSpeakPhrase(phrase.id)}
          >
            {phrase.label}
          </button>
        ))}
      </div>

      {recentUtterances.length ? (
        <div className="say-again" aria-label="Say it again">
          <p>Say it again</p>
          <div className="recent-utterances">
            {recentUtterances.map((utterance) => (
              <button key={utterance.id} type="button" onClick={() => onReplay(utterance)}>
                {utterance.text}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
